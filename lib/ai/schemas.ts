import { z } from "zod";

/**
 * Runtime schemas for everything the language model hands back.
 *
 * The model is an untrusted boundary: TypeScript types are erased at runtime,
 * so `JSON.parse(text)` followed by `data.evidence.map(...)` is an unchecked
 * assumption. Before this file existed, a missing or mistyped field threw
 * partway through an engine — after some rows had already been written — which
 * left a company with evidence and signals but no opportunity and no way to
 * tell that state apart from a legitimate one.
 *
 * Each engine now validates once, up front, and either gets a fully typed
 * object or fails before touching the database.
 */

/** Accepts a missing or null array as an empty one; a wrong type still fails. */
const arrayOf = <S extends z.ZodType>(item: S) =>
  z.array(item).nullish().transform((v) => v ?? []);

/** The 13 SignalType values in prisma/schema.prisma. */
export const SIGNAL_TYPES = [
  "HIRING",
  "FUNDING",
  "PRODUCT_LAUNCH",
  "LEADERSHIP_CHANGE",
  "EXPANSION",
  "TECHNOLOGY_CHANGE",
  "PAIN_POINT",
  "COMPETITOR_MENTION",
  "REGULATORY",
  "PARTNERSHIP",
  "AWARD",
  "PRESS_MENTION",
  "JOB_POSTING",
] as const;

/**
 * A signal type the database will actually accept. Anything unrecognised
 * degrades to PRESS_MENTION rather than failing the run — this mirrors the
 * hand-rolled whitelist that used to live in intelligence.ts, and closes the
 * matching hole in discovery.ts, which wrote the model's raw string straight
 * into an enum column.
 */
export const SignalTypeSchema = z.enum(SIGNAL_TYPES).catch("PRESS_MENTION");

/** The 12 ReplyClassification values in prisma/schema.prisma. */
export const REPLY_CLASSIFICATIONS = [
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
  "QUESTION",
  "REFERRAL",
  "INTERESTED",
  "OBJECTION",
  "NOT_NOW",
  "MEETING_REQUEST",
  "UNKNOWN",
] as const;

// ─────────────────────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────────────────────

/** `searchForTargetsWithAI` — the list of candidate domains. */
export const DiscoveryDomainsSchema = z.object({
  domains: z.array(z.string()),
});

/**
 * `extractCompanyData` — one company scraped from its website.
 * `name` and `domain` are required because Company.name and Company.domain are
 * non-null and `domain` is half of the upsert's unique key.
 */
export const ExtractedCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  industry: z.string().nullish(),
  description: z.string().nullish(),
  companySize: z.string().nullish(),
  location: z.string().nullish(),
  signals: arrayOf(
    z.object({
      type: SignalTypeSchema,
      title: z.string().min(1),
      description: z.string().nullish(),
    })
  ),
});

// ─────────────────────────────────────────────────────────────
// INTELLIGENCE
// ─────────────────────────────────────────────────────────────

const ScoreFactorSchema = z
  .object({
    score: z.coerce.number().nullish(),
    reasoning: z.string().nullish(),
  })
  .nullish();

/**
 * `researchCompany` — the full research payload.
 *
 * Only `evidence[].title` and `signals[].title` are strictly required, because
 * those columns are non-null in the database. Everything else is optional and
 * normalised, so a thin-but-honest response still produces a scored
 * opportunity instead of a crash.
 */
export const IntelligenceSchema = z.object({
  company_summary: z.string().nullish(),
  business_model: z.string().nullish(),
  problems: arrayOf(z.string()),
  why_now: z.string().nullish(),
  recommended_offer: z.string().nullish(),
  buyer_role: z.string().nullish(),
  recommended_channel: z.string().nullish(),
  reasoning: z.string().nullish(),
  confidence: z.coerce.number().nullish(),
  scoring_assessment: z
    .object({
      icp_fit: ScoreFactorSchema,
      problem_evidence: ScoreFactorSchema,
      buying_intent: ScoreFactorSchema,
      service_match: ScoreFactorSchema,
      buyer_confidence: ScoreFactorSchema,
      contactability: ScoreFactorSchema,
    })
    .nullish(),
  signals: arrayOf(
    z.object({
      type: SignalTypeSchema,
      title: z.string().min(1),
      description: z.string().nullish(),
      source: z.string().nullish(),
    })
  ),
  evidence: arrayOf(
    z.object({
      title: z.string().min(1),
      summary: z.string().nullish(),
      quote: z.string().nullish(),
      sourceUrl: z.string().nullish(),
      sourceName: z.string().nullish(),
      sourceType: z.string().nullish(),
    })
  ),
  decision_makers: arrayOf(
    z.object({
      name: z.string().nullish(),
      role: z.string().nullish(),
      email: z.string().nullish(),
      linkedin_url: z.string().nullish(),
      source: z.string().nullish(),
      confidence: z.coerce.number().nullish(),
      is_verified: z.boolean().nullish(),
    })
  ),
});

// ─────────────────────────────────────────────────────────────
// OUTREACH
// ─────────────────────────────────────────────────────────────

/**
 * `generateOutreach` — a drafted email. `subject` and `body` are required
 * because a draft without either is not a draft; failing here hands off to the
 * clearly-labelled safe template rather than saving a blank message.
 */
export const OutreachSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  personalization_notes: z.string().nullish(),
  evidence_used_ids: arrayOf(z.string()),
});

// ─────────────────────────────────────────────────────────────
// CONVERSATION
// ─────────────────────────────────────────────────────────────

/**
 * `processIncomingReply` — the classification of an inbound reply.
 * An unrecognised intent becomes UNKNOWN, which is what the existing fallback
 * path already writes, rather than blowing up on the enum column.
 *
 * `opportunityStatus` only accepts the two OpportunityStatus values the caller
 * acts on; anything else (including the QUALIFIED/WON the prompt used to ask
 * for, neither of which exists in the enum) becomes null and leaves the
 * opportunity's status untouched.
 */
export const ConversationReplySchema = z.object({
  intent: z.enum(REPLY_CLASSIFICATIONS).catch("UNKNOWN"),
  suggestedAction: z.string().nullish(),
  opportunityStatus: z.enum(["CONVERTED", "LOST"]).nullish().catch(null),
  suggestedReply: z.string().nullish(),
  summary: z.string().nullish(),
});

// ─────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Parse raw model output as JSON and validate it, throwing a message that says
 * what was actually wrong. `label` names the caller so the reason is readable
 * in an AgentRun's errorMessage without a stack trace.
 */
export function parseAIResponse<S extends z.ZodType>(
  raw: string | null | undefined,
  schema: S,
  label: string
): z.infer<S> {
  if (!raw || raw.trim().length === 0) {
    throw new Error(`${label}: the AI returned an empty response.`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch (err) {
    throw new Error(
      `${label}: the AI response was not valid JSON (${err instanceof Error ? err.message : String(err)}). ` +
        `First 200 characters: ${raw.trim().slice(0, 200)}`
    );
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`)
      .join("; ");
    throw new Error(`${label}: the AI response did not match the expected shape. ${issues}`);
  }

  return result.data;
}
