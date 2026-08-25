/**
 * Tests: the reasoning-model switch (`lib/ai/kimi.ts`)
 *
 * This file exists because everything it covers is invisible until it is running
 * in production against a paid endpoint, and every failure mode is expensive
 * rather than loud.
 *
 * Three things are load-bearing here:
 *
 *   1. **Unconfigured means unchanged.** With no env vars set, both engines must
 *      still call the Groq client with exactly the request they sent before. Five
 *      other test files mock `@/lib/ai/groq` and drive the engines through it; if
 *      that fallback broke, they would all break together and the reason would
 *      not be obvious from any one of them.
 *   2. **A wrong credential must switch Kimi off, not fail every run.** The Modal
 *      account token (`ak-...`) is a different credential from the proxy token,
 *      and using it produces a network error rather than a 401 — so a typo would
 *      otherwise mean every audit failing with a misleading message.
 *   3. **The ceiling must be enforced and explained.** It is a reasoning model at
 *      ~24x Groq's price with most of its output tokens hidden, so an uncapped
 *      call is a runaway bill, and a cap hit silently is a JSON syntax error
 *      that says nothing about its cause.
 *   4. **A test run must never reach the endpoint.** Jest inherits the shell's
 *      environment, so a developer with the two Kimi variables exported would
 *      otherwise have the engine suites call a paid endpoint over the real
 *      network. That is not theoretical — it happened once, and cost money.
 *
 * Nothing here touches the network: `fetch` is mocked, and the endpoint and token
 * are invented.
 */

jest.mock("@/lib/ai/groq", () => ({
  ai: { chat: { completions: { create: jest.fn() } } },
  MODEL: "test-model",
}));

/** Matching the other test files in this directory rather than importing a helper. */
const mocked = (fn: unknown) => fn as jest.Mock;

type KimiModule = typeof import("@/lib/ai/kimi");

/** Not a real credential — the shape is all `parseProxyToken` looks at. */
const FAKE_TOKEN = "wk-notarealkey.ws-notarealsecret";
const FAKE_BASE = "https://example-endpoint.modal.direct";

const KIMI_VARS = [
  "KIMI_BASE_URL",
  "MODAL_PROXY_TOKEN",
  "KIMI_MODEL",
  "KIMI_ENGINES",
  "KIMI_MAX_TOKENS",
  "KIMI_TIMEOUT_MS",
  "KIMI_ALLOW_IN_TEST",
] as const;

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

/**
 * `kimi.ts` reads its configuration once at module load, the same as `groq.ts`
 * and `features.ts` do, so changing configuration means loading it again.
 */
async function importKimi(env: Partial<Record<(typeof KIMI_VARS)[number], string>>) {
  jest.resetModules();
  for (const name of KIMI_VARS) delete process.env[name];
  Object.assign(process.env, env);
  return (await import("@/lib/ai/kimi")) as KimiModule;
}

/**
 * The loader for everything except the guard tests at the bottom. It sets
 * `KIMI_ALLOW_IN_TEST` because this is the one file allowed to reach the Kimi
 * branch — and it can, safely, only because `fetch` is mocked above.
 */
async function loadKimi(env: Partial<Record<(typeof KIMI_VARS)[number], string>> = {}) {
  return importKimi({ KIMI_ALLOW_IN_TEST: "1", ...env });
}

/** The freshly-registered Groq mock belonging to the same module instance. */
async function loadGroqMock() {
  const groq = await import("@/lib/ai/groq");
  return mocked(groq.ai.chat.completions.create);
}

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

/** A minimal successful completion in the shape the endpoint really returns. */
function completion(content: string, finishReason = "stop") {
  return jsonResponse({
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: {
      prompt_tokens: 200,
      completion_tokens: 450,
      reasoning_tokens: 300,
      prompt_tokens_details: { cached_tokens: 64 },
    },
  });
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  // The cost line is deliberate production logging; silence it in tests.
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
  for (const name of KIMI_VARS) {
    const before = originalEnv[name];
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
});

// ─────────────────────────────────────────────────────────────
// Base URL normalization
// ─────────────────────────────────────────────────────────────

describe("normalizeKimiBaseUrl", () => {
  it("leaves a clean host alone", async () => {
    const { normalizeKimiBaseUrl } = await loadKimi();
    expect(normalizeKimiBaseUrl(FAKE_BASE)).toBe(FAKE_BASE);
  });

  it("strips trailing slashes, a trailing /v1, and surrounding whitespace", async () => {
    const { normalizeKimiBaseUrl } = await loadKimi();

    // All four of these get pasted out of dashboards, and the difference between
    // them is a 404 that reads exactly like a stopped endpoint.
    expect(normalizeKimiBaseUrl(`${FAKE_BASE}/`)).toBe(FAKE_BASE);
    expect(normalizeKimiBaseUrl(`${FAKE_BASE}/v1`)).toBe(FAKE_BASE);
    expect(normalizeKimiBaseUrl(`${FAKE_BASE}/v1/`)).toBe(FAKE_BASE);
    expect(normalizeKimiBaseUrl(`  ${FAKE_BASE}  `)).toBe(FAKE_BASE);
  });
});

// ─────────────────────────────────────────────────────────────
// Which engine gets which model
// ─────────────────────────────────────────────────────────────

describe("usesKimi", () => {
  it("is off for every engine when nothing is configured", async () => {
    const { usesKimi } = await loadKimi();

    // The most important assertion in this file: it is what makes today's
    // deployment, and every other test file's Groq mock, keep working.
    expect(usesKimi("audit")).toBe(false);
    expect(usesKimi("intelligence")).toBe(false);
    expect(usesKimi("intelligence-fast")).toBe(false);
  });

  it("turns on the two interactive engines once endpoint and token are set", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
    });

    expect(usesKimi("audit")).toBe(true);
    expect(usesKimi("intelligence")).toBe(true);
  });

  it("leaves the high-volume paths on Groq by default", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
    });

    // The orchestrator's loop and the audit's own research pass. Both run many
    // calls inside one invocation, so opting them in has to be explicit.
    expect(usesKimi("intelligence-fast")).toBe(false);
  });

  it("stays off when the endpoint is set but the token is missing", async () => {
    const { usesKimi } = await loadKimi({ KIMI_BASE_URL: FAKE_BASE });
    expect(usesKimi("audit")).toBe(false);
  });

  it("stays off when the token is the wrong kind of Modal credential", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      // The account API token, which is the one you find first and the one that
      // fails as an unexplained network error instead of a 401.
      MODAL_PROXY_TOKEN: "ak-notarealaccounttoken",
    });

    expect(usesKimi("audit")).toBe(false);
    expect(usesKimi("intelligence")).toBe(false);
  });

  it("stays off when the token is missing its secret half", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: "wk-notarealkey",
    });

    expect(usesKimi("audit")).toBe(false);
  });

  it("honours KIMI_ENGINES to move one engine back to Groq", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
      KIMI_ENGINES: "audit",
    });

    // Intelligence runs once per company and is the one that drains a prepaid
    // balance, so being able to retreat on it alone is the point of the knob.
    expect(usesKimi("audit")).toBe(true);
    expect(usesKimi("intelligence")).toBe(false);
  });

  it("tolerates spacing and casing in KIMI_ENGINES", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
      KIMI_ENGINES: " Audit , INTELLIGENCE ",
    });

    expect(usesKimi("audit")).toBe(true);
    expect(usesKimi("intelligence")).toBe(true);
  });

  it("treats an unrecognised KIMI_ENGINES value as off for everything", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
      KIMI_ENGINES: "none",
    });

    expect(usesKimi("audit")).toBe(false);
    expect(usesKimi("intelligence")).toBe(false);
  });

  it("falls back to both engines when KIMI_ENGINES is set but blank", async () => {
    const { usesKimi } = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
      KIMI_ENGINES: "",
    });

    // An empty value in a dashboard almost always means "I did not fill this in",
    // not "disable the feature I just configured two variables for".
    expect(usesKimi("audit")).toBe(true);
    expect(usesKimi("intelligence")).toBe(true);
  });
});

describe("thinkingModelName", () => {
  it("reports the Groq model when Kimi is off", async () => {
    const { thinkingModelName } = await loadKimi();
    expect(thinkingModelName("audit")).toBe("test-model");
  });

  it("reports the Kimi model when Kimi is on", async () => {
    const kimi = await loadKimi({ KIMI_BASE_URL: FAKE_BASE, MODAL_PROXY_TOKEN: FAKE_TOKEN });

    // The weights repo id, not the Modal app name shown on the dashboard. Getting
    // this wrong is a 400 on every call.
    expect(kimi.thinkingModelName("audit")).toBe("moonshotai/Kimi-K3");
    expect(kimi.KIMI_MODEL).toBe("moonshotai/Kimi-K3");
  });

  it("accepts a KIMI_MODEL override", async () => {
    const kimi = await loadKimi({
      KIMI_BASE_URL: FAKE_BASE,
      MODAL_PROXY_TOKEN: FAKE_TOKEN,
      KIMI_MODEL: "moonshotai/Kimi-K3-Instruct",
    });

    expect(kimi.thinkingModelName("intelligence")).toBe("moonshotai/Kimi-K3-Instruct");
  });
});

// ─────────────────────────────────────────────────────────────
// The Groq fallback — what every existing test depends on
// ─────────────────────────────────────────────────────────────

describe("completeJsonObject on the Groq fallback", () => {
  it("sends the same request the engines sent before this switch existed", async () => {
    const kimi = await loadKimi();
    const create = await loadGroqMock();
    create.mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });

    const content = await kimi.completeJsonObject("audit", "the prompt", 0.4);

    expect(content).toBe('{"ok":true}');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "test-model",
      messages: [{ role: "user", content: "the prompt" }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });
  });

  it("does not put a token ceiling on the Groq path", async () => {
    const kimi = await loadKimi();
    const create = await loadGroqMock();
    create.mockResolvedValue({ choices: [{ message: { content: "{}" } }] });

    await kimi.completeJsonObject("audit", "the prompt", 0.4);

    // `max_tokens` exists to bound a $15/MTok reasoning model. Applying it here
    // too would newly truncate long audits that generate fine today, which is a
    // regression dressed up as a safety measure.
    expect(create.mock.calls[0][0]).not.toHaveProperty("max_tokens");
  });

  it("never reaches the network", async () => {
    const kimi = await loadKimi();
    const create = await loadGroqMock();
    create.mockResolvedValue({ choices: [{ message: { content: "{}" } }] });

    await kimi.completeJsonObject("audit", "the prompt", 0.4);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when the model says nothing", async () => {
    const kimi = await loadKimi();
    const create = await loadGroqMock();
    create.mockResolvedValue({ choices: [{ message: { content: null } }] });

    // Both call sites already treat an empty answer as a failed attempt and
    // retry, so this must not become an exception that skips that path.
    await expect(kimi.completeJsonObject("audit", "the prompt", 0.4)).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// The Kimi path
// ─────────────────────────────────────────────────────────────

describe("completeJsonObject against Kimi", () => {
  async function configured(env: Record<string, string> = {}) {
    return loadKimi({ KIMI_BASE_URL: FAKE_BASE, MODAL_PROXY_TOKEN: FAKE_TOKEN, ...env });
  }

  it("posts to the OpenAI-compatible path with both auth headers", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(completion('{"ok":true}'));

    const content = await kimi.completeJsonObject("audit", "the prompt", 0.4);

    expect(content).toBe('{"ok":true}');

    const [url, init] = fetchMock.mock.calls[0];
    // Not `/openai/v1/...`, which is where groq-sdk posts and the reason this
    // module uses plain fetch instead of repointing that client.
    expect(url).toBe(`${FAKE_BASE}/v1/chat/completions`);
    expect(init.headers).toMatchObject({
      "Modal-Key": "wk-notarealkey",
      "Modal-Secret": "ws-notarealsecret",
    });
  });

  it("sends the model, the JSON flag and a token ceiling", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(completion("{}"));

    await kimi.completeJsonObject("intelligence", "the prompt", 0.2);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: "moonshotai/Kimi-K3",
      messages: [{ role: "user", content: "the prompt" }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 16_000,
    });
  });

  it("honours a KIMI_MAX_TOKENS override and ignores a nonsensical one", async () => {
    const raised = await configured({ KIMI_MAX_TOKENS: "24000" });
    fetchMock.mockResolvedValue(completion("{}"));
    await raised.completeJsonObject("audit", "p", 0.4);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(24_000);

    fetchMock.mockReset();

    // A typo must not remove the ceiling — an uncapped reasoning model is the
    // failure this setting exists to prevent.
    const broken = await configured({ KIMI_MAX_TOKENS: "not-a-number" });
    fetchMock.mockResolvedValue(completion("{}"));
    await broken.completeJsonObject("audit", "p", 0.4);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(16_000);
  });

  it("names the ceiling when the answer was cut off by it", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(completion('{"headline":"half a sen', "length"));

    // Left alone this surfaces as a JSON syntax error three retries later, which
    // reads like a flaky model rather than a setting one line away from a fix.
    await expect(kimi.completeJsonObject("audit", "p", 0.4)).rejects.toThrow(/KIMI_MAX_TOKENS/);
  });

  it("reports the status and body when the endpoint refuses", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "model 'kimi-k33' does not exist" }, { ok: false, status: 400 })
    );

    // A wrong model id comes back as a 400 naming the ids the server accepts, so
    // the body is the whole diagnosis and must not be swallowed.
    const attempt = kimi.completeJsonObject("audit", "p", 0.4);
    await expect(attempt).rejects.toThrow(/400/);
    await expect(attempt).rejects.toThrow(/does not exist/);
  });

  it("does not put the credential anywhere it could be logged", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "unauthorized" }, { ok: false, status: 401 })
    );

    const error = await kimi.completeJsonObject("audit", "p", 0.4).catch((err: Error) => err);

    expect(String(error)).not.toContain("notarealsecret");
    expect(String(error)).not.toContain(FAKE_TOKEN);
  });

  it("does not retry internally", async () => {
    const kimi = await configured();
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    await expect(kimi.completeJsonObject("audit", "p", 0.4)).rejects.toThrow("socket hang up");

    // Both call sites already attempt three times. A client that retried twice
    // more on its own would quietly make that nine calls at $15/MTok.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the endpoint answers with no content", async () => {
    const kimi = await configured();
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }));

    await expect(kimi.completeJsonObject("audit", "p", 0.4)).resolves.toBeNull();
  });

  it("leaves the Groq client untouched", async () => {
    const kimi = await configured();
    const create = await loadGroqMock();
    fetchMock.mockResolvedValue(completion("{}"));

    await kimi.completeJsonObject("audit", "p", 0.4);

    expect(create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// The guard that keeps a test run off the paid endpoint
//
// Every block above deliberately opts out of this guard, because testing the
// Kimi branch is the point of the file. This block is the only one that sees
// `kimi.ts` the way every *other* test file sees it, and it is the case that was
// missing when the engine suites reached the real endpoint and spent money.
// ─────────────────────────────────────────────────────────────

describe("under a test run, with Kimi fully configured", () => {
  /** Exactly the configuration that works in production, and no opt-in. */
  const fullyConfigured = { KIMI_BASE_URL: FAKE_BASE, MODAL_PROXY_TOKEN: FAKE_TOKEN };

  it("reports every engine as off", async () => {
    const { usesKimi } = await importKimi(fullyConfigured);

    // Jest inherits the shell environment. Anyone developing this feature has
    // both variables exported, so "configured" is the normal case locally, not
    // an unusual one.
    expect(usesKimi("audit")).toBe(false);
    expect(usesKimi("intelligence")).toBe(false);
    expect(usesKimi("intelligence-fast")).toBe(false);
  });

  it("reports the Groq model name", async () => {
    const { thinkingModelName } = await importKimi(fullyConfigured);
    expect(thinkingModelName("audit")).toBe("test-model");
  });

  it("routes to the mocked Groq client instead of the network", async () => {
    const kimi = await importKimi(fullyConfigured);
    const create = await loadGroqMock();
    create.mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });

    const content = await kimi.completeJsonObject("audit", "the prompt", 0.4);

    // This is the assertion whose absence cost real money: the engine suites
    // mock `@/lib/ai/groq` and assert against it, so a live Kimi meant their
    // mock was never called, every test timed out waiting on a 60-second
    // reasoning model, and the ones that did connect were billed.
    expect(content).toBe('{"ok":true}');
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still allows the opt-in this file relies on", async () => {
    const kimi = await importKimi({ ...fullyConfigured, KIMI_ALLOW_IN_TEST: "1" });

    // Guarding against a guard so absolute that the feature becomes untestable.
    expect(kimi.usesKimi("audit")).toBe(true);
  });
});
