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
// GROWTH AUDIT
// ─────────────────────────────────────────────────────────────

/**
 * The areas a finding can sit in.
 *
 * Deliberately generic business areas rather than marketing ones. ProspectIQ's
 * customers are white-label outsourcing agencies of every kind — a dev shop, a
 * staffing firm and a paid-ads agency all generate audits from here, and a fixed
 * set of marketing categories would be meaningless to two of the three. These six
 * are readable through any of those lenses, which also gives the scorecard stable
 * dimensions to report against.
 */
export const AUDIT_AREAS = [
  "POSITIONING",  // whether a visitor can tell what they sell, and to whom
  "ACQUISITION",  // how new customers find them
  "CONVERSION",   // turning interest into revenue
  "DELIVERY",     // capacity to actually serve the customers they win
  "RETENTION",    // keeping the customers they have
  "TECHNOLOGY",   // the stack, and what it is costing them
] as const;

export const AuditAreaSchema = z.enum(AUDIT_AREAS).catch("POSITIONING");

/**
 * How much a finding matters. The model judges severity; it does **not** produce
 * the numeric score — `lib/scoring/audit-score.ts` computes that in code from
 * these severities, so two audits of equally healthy companies can't disagree
 * because the model was in a different mood.
 */
export const AUDIT_SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const AuditSeveritySchema = z.enum(AUDIT_SEVERITIES).catch("MEDIUM");

/**
 * How much work a fix is. `QUICK_WIN` is the one that earns replies — a prospect
 * who can act on something this week is a prospect who answers the email.
 */
export const AUDIT_EFFORTS = ["QUICK_WIN", "PROJECT", "ONGOING"] as const;
export const AuditEffortSchema = z.enum(AUDIT_EFFORTS).catch("PROJECT");

export type AuditArea = (typeof AUDIT_AREAS)[number];
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];
export type AuditEffort = (typeof AUDIT_EFFORTS)[number];

/**
 * `generateGrowthAudit` — a prospect-facing audit of one company.
 *
 * Read this next to `IntelligenceSchema` and the difference is the whole feature:
 * intelligence is written *about* a company *for* the agency chasing it, and an
 * audit is written about that same company *for the company itself*. So nothing
 * here may leak the sales process — no fit scores, no buyer confidence, no
 * contactability. Those measure how easy the prospect is to sell to, and showing
 * a prospect that would end the relationship rather than start it.
 *
 * Required fields are required on purpose:
 *   - `findings` must be non-empty. An audit with nothing in it isn't a thin
 *     audit, it's a failed one, and failing loudly beats emailing a prospect a
 *     document with no observations in it.
 *   - every finding needs a `recommendation`. An observation with no proposed fix
 *     is a complaint, and the agency is sending this to win work.
 *
 * `strengths` is not decoration. An audit that is purely critical reads as an
 * attack and gets deleted; naming what already works buys the credibility that
 * makes the criticism land.
 */
export const GrowthAuditSchema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  findings: z
    .array(
      z.object({
        area: AuditAreaSchema,
        severity: AuditSeveritySchema,
        effort: AuditEffortSchema,
        title: z.string().min(1),
        /** What was actually observed. Grounded in the evidence handed to the prompt. */
        observation: z.string().min(1),
        /** Why it costs them something. Nullish — better empty than invented. */
        impact: z.string().nullish(),
        recommendation: z.string().min(1),
        /**
         * Ids of the `Evidence` rows this finding rests on. The prompt supplies
         * the ids, so anything not in that list is the model inventing a citation
         * and the caller drops it — same guard as `OutreachSchema.evidence_used_ids`.
         */
        evidenceIds: arrayOf(z.string()),
        /**
         * Which of the agency's `Offer.services[]` would fix this. Nullish so a
         * genuine observation isn't discarded for lacking one, but a finding with
         * no service behind it sells nothing — the caller counts these, because a
         * whole audit of them means the offer needs filling in, not the prompt.
         */
        matchedService: z.string().nullish(),
      })
    )
    .min(1),
  strengths: arrayOf(z.string()),
  /** The single concrete ask at the end. */
  nextStep: z.string().nullish(),
});

// ─────────────────────────────────────────────────────────────
// LOOKALIKE
// ─────────────────────────────────────────────────────────────

/**
 * `describeLookalikeProfile` — the *narrative* half of a lookalike profile.
 *
 * Read what is missing from this schema, because that is the design: no
 * industries, no employee range, no technology list, no geography. Every
 * firmographic fact in a lookalike profile is computed in code from the real
 * `Company` rows the agency's own customers produced — see
 * `computeSharedProfile` in `lib/ai/lookalike.ts`. The model is handed those
 * facts and asked only to do the part arithmetic cannot: name the pattern,
 * describe it in a sentence a human would recognise, and propose the search
 * language that would find more of them.
 *
 * The reason is specific rather than stylistic. An agency pastes three customers
 * it already has and asks "find more like these" — the entire value is that the
 * answer is derived from those three. A model asked to produce the whole profile
 * will confidently return a plausible ICP that is really a summary of B2B SaaS in
 * general, and nothing downstream could tell the difference. Restricting it to
 * the narrative makes that class of failure impossible instead of unlikely.
 *
 * `keywords` is the one field with real leverage: `searchForTargetsWithAI` builds
 * three query angles per keyword, so these become the actual web searches. The
 * caller trims and caps them for that reason.
 */
export const LookalikeNarrativeSchema = z.object({
  /** A short label an agency would recognise, e.g. "Mid-market DTC skincare brands". */
  name: z.string().min(1),
  /** One paragraph on what these companies have in common. */
  description: z.string().min(1),
  /**
   * Short search phrases that would surface similar companies. Not required —
   * a profile with no keywords still searches on industry, size and region, and
   * an empty list beats an invented one.
   */
  keywords: arrayOf(z.string()),
  /** 3-5 plain observations shown back to the agency so it can judge the profile. */
  sharedTraits: arrayOf(z.string()),
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
