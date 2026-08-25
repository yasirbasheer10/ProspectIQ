import { ai, MODEL } from "./groq";

// ─────────────────────────────────────────────────────────────
// KIMI K3 WRAPPER — the reasoning model, for the two jobs that need judgment
//
// `groq.ts` stays the default for everything. This file is the second vendor,
// used only where the quality of the *thinking* is the product rather than the
// speed of extraction: the Growth Audit, and the per-company intelligence run.
//
// This is not a pluggable provider layer, and it should not become one. It is a
// two-way switch between two named vendors for two named engines, deliberately
// not extensible — the one-file-per-vendor convention in this directory has
// survived three model changes precisely because nothing abstracts over it.
//
// ## Why plain fetch instead of reusing groq-sdk
//
// groq-sdk is OpenAI-compatible in its request *shape* but not in its URL: it
// posts to `/openai/v1/chat/completions`. Pointing its `baseURL` at a vLLM
// server, which serves `/v1/chat/completions`, produces a 404 that looks
// exactly like a dead endpoint. Rewriting the path through the SDK's `fetch`
// hook would work but leaves us depending on an internal path that is not part
// of its public contract. The app only ever sends model/messages/
// response_format/temperature and only ever reads `choices[0].message.content`
// plus `usage`, so the whole surface we need is the forty lines below.
//
// ## Everything here was measured, not assumed (probe run 2026-08-26)
//
//   - The `model:` string is `moonshotai/Kimi-K3`. NOT the Modal app name shown
//     on the dashboard.
//   - Auth is a Modal *proxy* token, `wk-<key>.ws-<secret>`, split across the
//     `Modal-Key` and `Modal-Secret` headers. The `ak-...` token on the account
//     page is a different credential, and with it the request dies as a network
//     error rather than a 401 — badly misleading, hence the format check below.
//   - `response_format: { type: "json_object" }` works and returns parseable
//     JSON, with the reasoning kept out of `content`. That was make-or-break:
//     every engine in this app sends that flag.
//   - It costs ~24x Groq, and most of every output token is invisible reasoning
//     billed at the completion rate — two thirds on the probe's short prompt,
//     and 85-92% on the real audit prompt. That is what MAX_TOKENS is for.
//   - The advertised cached-prompt discount is not reachable on a Shared
//     Endpoint (two identical calls both cached only the chat template), so do
//     not reshape prompts to chase it.
// ─────────────────────────────────────────────────────────────

/** Published Modal rates, used only for the cost line in the logs. $/MTok. */
const RATES = { input: 3.0, cached: 0.3, output: 15.0 } as const;

/**
 * The engines allowed to spend Kimi tokens. Deliberately a closed set.
 *
 * `intelligence-fast` is the same intelligence engine, called where the run is
 * not the thing the user asked for: the orchestrator's loop over up to twenty
 * companies, and the evidence-gathering pass the audit does before it writes.
 * It is a separate key so it can be left out of the default list below. That
 * loop on the reasoning model would cost about a dollar a run and spend twenty
 * minutes generating, which the orchestrator's own timeout comment says it
 * cannot survive; and doubling the audit's runtime is the likeliest way the
 * fire-and-forget audit gets cut off mid-write.
 *
 * The split is principled rather than just thrifty. Pulling signals, quotes and
 * names out of search snippets is extraction, which the fast model does well.
 * Deciding what those facts mean and writing the prose a human reads is
 * judgment, and that is what the reasoning model is here for.
 */
export type ThinkingEngine = "audit" | "intelligence" | "intelligence-fast";

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Some deployments hand out a URL ending in `/v1` and some don't. Getting it
 * wrong is a 404 either way, which is indistinguishable from a stopped
 * endpoint, so normalize rather than trust what was pasted in.
 */
export function normalizeKimiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

const baseUrl = process.env.KIMI_BASE_URL ? normalizeKimiBaseUrl(process.env.KIMI_BASE_URL) : "";

/**
 * `wk-<key>.ws-<secret>` split into the two headers Modal expects. Returns null
 * for anything else, including the `ak-...` account token, so a wrong
 * credential leaves Kimi switched off instead of failing every audit at runtime.
 */
function parseProxyToken(raw: string | undefined): Record<string, string> | null {
  const match = raw?.match(/^\s*(wk-[^.\s]+)\.(ws-\S+?)\s*$/);
  return match ? { "Modal-Key": match[1], "Modal-Secret": match[2] } : null;
}

const authHeaders = parseProxyToken(process.env.MODAL_PROXY_TOKEN);

export const KIMI_MODEL = process.env.KIMI_MODEL || "moonshotai/Kimi-K3";

/**
 * Ceiling on completion tokens, which on this server includes the hidden
 * reasoning.
 *
 * 16,000 rather than something tighter, because five real audit calls were
 * measured by accident on 2026-08-26 and the reasoning is far heavier than the
 * answer: 4,051 / 4,423 / 5,523 / 5,774 / 7,360 tokens of thinking against only
 * 640-920 tokens of visible JSON. At 8,000 one of those five hit the ceiling
 * exactly and was cut off mid-answer — and those were small fixture prompts, so
 * a real company with a page of evidence needs more room, not less.
 *
 * A tight cap is also the more expensive choice, not the safer one: a truncated
 * audit is worthless and the call site retries three times, so the ceiling turns
 * ~$0.12 of useful output into ~$0.36 of nothing. Worst case here is about
 * twenty-four cents for one call; the measured typical is ten.
 *
 * No other call site in this app sets a limit at all. That was harmless on Groq
 * and is not harmless at $15/MTok.
 */
const MAX_TOKENS = positiveInt(process.env.KIMI_MAX_TOKENS, 16_000);

/**
 * The SDK default of 60s is too short here. Throughput is ~85 tokens/sec, so a
 * long audit is a minute of generation before the first byte of usable JSON.
 */
const TIMEOUT_MS = positiveInt(process.env.KIMI_TIMEOUT_MS, 180_000);

/**
 * Which engines route to Kimi. The two interactive ones by default; set
 * `KIMI_ENGINES=audit` to put intelligence back on Groq without touching the
 * audit, or `none` for neither. Note that `intelligence-fast` is absent, so the
 * orchestrator's loop and the audit's own research pass stay on Groq unless it
 * is named explicitly.
 *
 * Worth keeping separate because the two engines have very different volume: an
 * audit is one call a human asked for, while intelligence runs once per company
 * and is the one that will drain a prepaid balance.
 */
const enabledEngines = new Set(
  (process.env.KIMI_ENGINES || "audit,intelligence")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Never spend money or touch the network from a test run.
 *
 * Jest inherits the ambient shell environment, and a developer working on this
 * feature is exactly the person who has `KIMI_BASE_URL` and `MODAL_PROXY_TOKEN`
 * exported. Without this guard, `audit-content.test.ts` and
 * `ai-intelligence.test.ts` skip the Groq client they carefully mock and call
 * the real paid endpoint instead — which is not hypothetical: on 2026-08-26 that
 * happened, timed out 34 tests and spent about fifty cents of a prepaid balance.
 * Note that the repo's own jest config loads no env file; checking that was not
 * enough, because the shell had already been used to run the probe.
 *
 * `__tests__/ai-kimi.test.ts` is the one file that has to exercise this branch,
 * and it opts back in with `fetch` mocked. Nothing else should ever set that
 * variable and it is not a deployment setting.
 *
 * Both signals are checked because either alone can be defeated: `NODE_ENV` can
 * already be set in the shell, in which case jest leaves it alone, and
 * `JEST_WORKER_ID` is specific to one runner. Neither is ever set on Vercel.
 */
const underTestRunner =
  process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

const blockedByTestRun = underTestRunner && !process.env.KIMI_ALLOW_IN_TEST;

/**
 * True when this engine should use Kimi. Requires the endpoint *and* a
 * well-formed token, so a half-finished configuration silently keeps working on
 * Groq rather than failing every run.
 */
export function usesKimi(engine: ThinkingEngine): boolean {
  if (blockedByTestRun) return false;
  return Boolean(baseUrl) && authHeaders !== null && enabledEngines.has(engine);
}

/** Which model an engine will actually use. For logs and run records. */
export function thinkingModelName(engine: ThinkingEngine): string {
  return usesKimi(engine) ? KIMI_MODEL : MODEL;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/**
 * One line per call in the Vercel logs saying what it cost. With a prepaid
 * balance and two thirds of the spend invisible in the response body, this is
 * the only way to know where the money went before it is gone.
 */
function logCost(engine: ThinkingEngine, usage: Usage | undefined, ms: number) {
  if (!usage) return;

  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoning = usage.reasoning_tokens ?? 0;
  const fresh = Math.max(0, input - cached);
  const dollars = (fresh * RATES.input + cached * RATES.cached + output * RATES.output) / 1e6;

  console.log(
    `[kimi:${engine}] $${dollars.toFixed(4)} — ${input} in, ${output} out ` +
      `(${reasoning} of it reasoning), ${(ms / 1000).toFixed(1)}s`
  );
}

/**
 * One JSON-object completion, from whichever model this engine is configured
 * for. Returns the raw content string for the caller to parse, or null if the
 * model returned nothing — callers already have retry loops that treat an empty
 * response as a failed attempt, and those loops stay where they are.
 *
 * Throws on transport and HTTP failures, same as the Groq client does, so the
 * existing retry and error handling at each call site is unchanged.
 */
export async function completeJsonObject(
  engine: ThinkingEngine,
  prompt: string,
  temperature: number
): Promise<string | null> {
  if (!usesKimi(engine)) {
    const response = await ai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature,
    });
    return response.choices[0]?.message?.content ?? null;
  }

  const started = Date.now();

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // The body carries the actual complaint — a wrong model id, for one, comes
    // back as a 400 naming the ids the server will accept. Truncated because it
    // goes to a log, and never including the headers, which hold the token.
    const body = await response.text().catch(() => "");
    throw new Error(
      `Kimi returned ${response.status} for the ${engine} engine: ${body.slice(0, 300) || "(empty body)"}`
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: Usage;
  };

  logCost(engine, payload.usage, Date.now() - started);

  const choice = payload.choices?.[0];

  // Hitting the ceiling means the JSON is cut off mid-object. Parsing it fails
  // with a syntax error that says nothing about the cause, so name the cause
  // here — otherwise this looks like a flaky model rather than a setting.
  if (choice?.finish_reason === "length") {
    throw new Error(
      `Kimi hit the ${MAX_TOKENS}-token ceiling on the ${engine} engine and the JSON is incomplete. ` +
        `Raise KIMI_MAX_TOKENS, or shorten the prompt.`
    );
  }

  return choice?.message?.content ?? null;
}
