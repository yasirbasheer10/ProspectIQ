/**
 * Growth Audit generation.
 *
 * The agency's pitch document. A logged-in agency points this at one prospect and
 * gets back a report they send *to that prospect*: here is what we noticed about
 * your business, here is what we would fix.
 *
 * ── Why this is not `intelligence.ts` with a different prompt ─────────────────
 *
 * Same raw material, opposite reader. `researchCompany` writes about a company
 * *for the agency chasing it* — problems to exploit, who to call, how well they
 * fit the ICP. An audit is written about that same company *for the company
 * itself*. So everything about the sales process has to stay out: no fit score,
 * no buyer confidence, no contactability, no mention of ProspectIQ. The prospect
 * is supposed to believe their prospective supplier wrote this, because in every
 * sense that matters the agency did.
 *
 * ── Where the content comes from ─────────────────────────────────────────────
 *
 * `Evidence` and `Signal` rows, plus the firmographics on `Company` — never raw
 * scraped page text. Two reasons. Evidence rows carry a `quote` and a
 * `sourceUrl`, which is the difference between "your hiring suggests growth" and
 * "your careers page lists four support roles and no support lead"; and anything
 * that later improves evidence quality — Perplexity, job-posting signals,
 * whatever comes next — improves the audit for free without touching this file.
 *
 * Consequence worth knowing: an audit is only as good as the research behind it,
 * so this file runs `researchCompany` first when a company has no evidence yet.
 * `calculateAuditScore` reports the resulting confidence, and returns LOW when
 * there's too little to stand on.
 *
 * ── Two entry points ─────────────────────────────────────────────────────────
 *
 * `generateAuditContent` is pure: it reads, prompts, validates and scores, and
 * writes nothing. `runGrowthAuditEngine` is the background job that owns the
 * database side. Keeping them apart is what makes the interesting half testable
 * without a database, the same way `mapAIOutputToScoreInput` is.
 */

import { randomBytes } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { completeJsonObject } from "./kimi";
import {
  GrowthAuditSchema,
  parseAIResponse,
  AuditAreaSchema,
  AuditSeveritySchema,
  AuditEffortSchema,
} from "./schemas";
import type { AuditArea, AuditEffort, AuditSeverity } from "./schemas";
import { ingestDomain } from "./discovery";
import { researchCompany } from "./intelligence";
import { calculateAuditScore, type AuditScoreResult } from "@/lib/scoring/audit-score";

export interface GenerateAuditParams {
  companyId: string;
  workspaceId: string;
}

/**
 * A source behind one finding, copied in rather than referenced.
 *
 * Denormalised on purpose, same reasoning as `GrowthAudit.brandSnapshot`: once an
 * audit has been sent to a prospect it is a document that was sent, and it must
 * not change because someone later re-ran research and replaced the evidence rows
 * it quoted.
 */
export interface AuditCitation {
  title: string;
  quote: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
}

export interface AuditFinding {
  area: AuditArea;
  severity: AuditSeverity;
  effort: AuditEffort;
  title: string;
  observation: string;
  impact: string | null;
  recommendation: string;
  /** One of the agency's own `Offer.services[]`, or null if none matched. */
  matchedService: string | null;
  citations: AuditCitation[];
}

export interface AuditContent {
  headline: string;
  summary: string;
  findings: AuditFinding[];
  strengths: string[];
  nextStep: string | null;
  score: AuditScoreResult;
  /**
   * Findings with no service of the agency's behind them.
   *
   * Surfaced rather than hidden because it diagnoses a specific problem: when this
   * equals the total, the agency's `Offer` is empty and the fix is onboarding, not
   * the prompt. An audit full of recommendations the agency doesn't sell is a
   * document that wins them nothing.
   */
  unmatchedFindingCount: number;
}

/**
 * Build one audit's content for a company. Does not write it — persistence and the
 * `AgentRun` bookkeeping belong to the caller.
 *
 * Throws with a readable reason on anything fatal, so the caller can put it
 * straight into `GrowthAudit.errorMessage` without a stack trace.
 */
export async function generateAuditContent(params: GenerateAuditParams): Promise<AuditContent> {
  const { companyId, workspaceId } = params;

  const company = await prisma.company.findFirst({
    where: { id: companyId, workspaceId },
    include: {
      evidence: { orderBy: { capturedAt: "desc" }, take: 25 },
      signals: { orderBy: { detectedAt: "desc" }, take: 15 },
    },
  });

  if (!company) {
    // Same message whether it doesn't exist or belongs to someone else — see
    // lib/authz.ts for why that distinction is deliberately not leaked.
    throw new Error("Company not found.");
  }

  // The agency's own offer. Without it the model can observe problems but cannot
  // propose anything the agency is actually able to deliver.
  //
  // A workspace can hold more than one: onboarding creates "Main Offer" with just
  // a description, and the settings page upserts a separate `demo-offer-<id>` row
  // with the real services list. Taking the oldest — as this did — reliably picked
  // the empty onboarding one, so every recommendation came back unmatched even
  // after the agency had filled in exactly the field that was missing.
  //
  // So pick the offer with the most to say. `services` dominates because it is
  // the only field `matchService` reads; the rest break ties.
  const offers = await prisma.offer.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const offer =
    offers.length <= 1
      ? (offers[0] ?? null)
      : offers.reduce((best, candidate) =>
          offerRichness(candidate) > offerRichness(best) ? candidate : best
        );

  const services = offer?.services ?? [];

  const prompt = buildAuditPrompt({ company, offer, services });

  const raw = await callModelWithRetries(prompt, company.domain ?? company.name);

  const parsed = parseAIResponse(
    raw,
    GrowthAuditSchema,
    `Growth audit failed for ${company.name}`
  );

  // ── Ground the citations ───────────────────────────────────────────────────
  // The prompt hands the model real evidence ids. Anything it cites that isn't in
  // that set is an invented reference, and an invented source in a document the
  // prospect will read is the worst failure this feature has. Drop them silently —
  // same guard as `OutreachSchema.evidence_used_ids`.
  const evidenceById = new Map(company.evidence.map((e) => [e.id, e]));

  const findings: AuditFinding[] = parsed.findings.map((f) => ({
    area: f.area,
    severity: f.severity,
    effort: f.effort,
    title: f.title,
    observation: f.observation,
    impact: f.impact ?? null,
    recommendation: f.recommendation,
    matchedService: matchService(f.matchedService, services),
    citations: f.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map((e) => ({
        title: e.title,
        quote: e.quote,
        sourceUrl: e.sourceUrl,
        sourceName: e.sourceName,
      })),
  }));

  const score = calculateAuditScore({
    findings: findings.map((f) => ({ area: f.area, severity: f.severity })),
    evidenceCount: company.evidence.length,
    signalCount: company.signals.length,
    findingsCitingEvidence: findings.filter((f) => f.citations.length > 0).length,
  });

  return {
    headline: parsed.headline,
    summary: parsed.summary,
    findings,
    strengths: parsed.strengths,
    nextStep: parsed.nextStep ?? null,
    score,
    unmatchedFindingCount: findings.filter((f) => !f.matchedService).length,
  };
}

// ─── The background job ────────────────────────────────────────

/**
 * How many audits one workspace may generate per calendar month.
 *
 * Deliberately separate from the discovery `budgetLimit` on `CustomAgent`. That
 * one caps how many companies get *discovered*, and an agency doing zero
 * discovery this month should still be able to audit a prospect who walked in
 * through the front door. Sharing one counter would make the two features
 * silently steal from each other.
 */
export const MONTHLY_AUDIT_LIMIT = 50;

export interface RunGrowthAuditParams {
  /** Bare domain or full URL, straight from the input box. */
  domain: string;
  workspaceId: string;
  /** The GROWTH_AUDIT run created by the action, already QUEUED. */
  agentRunId: string;
  /** Stamped onto the audit so a team can see who generated it. */
  userId?: string;
}

/**
 * Generate one audit, start to finish, in the background.
 *
 * Mirrors `runDiscoveryEngine`: the action creates the `AgentRun` and returns
 * immediately, this runs unawaited, and the UI polls the run. Nothing here
 * throws to the caller — every failure is recorded on both the run and, once it
 * exists, the audit row, because an unhandled rejection in a fire-and-forget
 * promise would leave the UI polling a run that never reaches a terminal state.
 */
export async function runGrowthAuditEngine(params: RunGrowthAuditParams): Promise<void> {
  const { domain, workspaceId, agentRunId, userId } = params;

  let auditId: string | null = null;

  try {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    // ── 1. The company ───────────────────────────────────────────────────────
    // Same ingest Discovery uses, so a pasted URL produces exactly the same
    // firmographics and signals a discovered domain would.
    const ingested = await ingestDomain({ domain, workspaceId, source: "audit", agentRunId });

    if (!ingested.companyId) {
      throw new Error(
        ingested.reason ?? `Could not read ${domain}. Check the address and try again.`
      );
    }

    const companyId = ingested.companyId;

    // ── 2. The audit row ─────────────────────────────────────────────────────
    // Created only now, because `companyId` is required and step 1 is what
    // produces it. Snapshotting the branding here freezes how this audit looks:
    // the agency can rebrand tomorrow and an audit already sent keeps its
    // original logo and colour.
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        logoUrl: true,
        brandColor: true,
        senderName: true,
        senderTitle: true,
        senderEmail: true,
        websiteUrl: true,
      },
    });

    const audit = await prisma.growthAudit.create({
      data: {
        // 32 random bytes rather than the cuid: this token is the only thing
        // protecting the public page, and cuids leak enough ordering to guess
        // neighbours from. base64url so it is safe to drop straight into a path.
        shareToken: randomBytes(32).toString("base64url"),
        status: "RUNNING",
        agentRunId,
        workspaceId,
        companyId,
        createdByUserId: userId ?? null,
        brandSnapshot: (workspace ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    auditId = audit.id;

    // ── 3. Research, if there is nothing to go on yet ─────────────────────────
    // Skipped when evidence already exists, so re-auditing a company the agency
    // already researched doesn't spend another Serper credit or trip
    // `researchCompany`'s own in-flight guard.
    //
    // Failure here is survivable on purpose. An audit built from the website
    // alone is a weaker audit, not a broken one, and `calculateAuditScore`
    // already reports that honestly as LOW confidence and hides the headline
    // score. Losing the whole audit because a news search came back empty would
    // be the worse outcome.
    const existingEvidence = await prisma.evidence.count({ where: { companyId } });

    if (existingEvidence === 0) {
      try {
        // `fastModel` on purpose. This pass extracts signals and quotes out of
        // search snippets, which the fast model is good at, and the audit's own
        // writing below is where the reasoning model earns its cost. Running
        // both on the slow model would roughly double an audit that is already
        // fired unawaited from the server action.
        await researchCompany({ companyId, workspaceId, fastModel: true });
      } catch (err) {
        console.warn(`Growth audit: research failed for ${domain}, continuing without it:`, err);
        await logActivity(
          workspaceId,
          "AUDIT_RESEARCH_SKIPPED",
          `Research unavailable for ${ingested.name ?? domain}`,
          err instanceof Error ? err.message : "Unknown error",
          { companyId }
        );
      }
    }

    // ── 4. Write it ──────────────────────────────────────────────────────────
    const content = await generateAuditContent({ companyId, workspaceId });

    await prisma.growthAudit.update({
      where: { id: audit.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        headline: content.headline,
        summary: content.summary,
        auditScore: content.score.overall,
        auditGrade: content.score.grade,
        sections: {
          findings: content.findings,
          strengths: content.strengths,
          nextStep: content.nextStep,
          score: content.score,
          unmatchedFindingCount: content.unmatchedFindingCount,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultSummary: `Audited ${ingested.name ?? domain}: ${content.findings.length} finding(s), grade ${content.score.grade}.`,
      },
    });

    await logActivity(
      workspaceId,
      "AUDIT_GENERATED",
      `Growth audit ready for ${ingested.name ?? domain}`,
      content.headline,
      { companyId }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Growth audit failed for ${domain}:`, err);

    // Both rows, so neither the run list nor the audit page shows a spinner that
    // never resolves. Each update is guarded: if the failure was the audit row's
    // own create, `auditId` is null and there is nothing to mark.
    if (auditId) {
      await prisma.growthAudit
        .update({ where: { id: auditId }, data: { status: "FAILED", errorMessage: message } })
        .catch((e) => console.error("Could not mark audit FAILED:", e));
    }

    await prisma.agentRun
      .update({
        where: { id: agentRunId },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
      })
      .catch((e) => console.error("Could not mark audit run FAILED:", e));

    await logActivity(workspaceId, "AUDIT_FAILED", `Growth audit failed for ${domain}`, message).catch(
      () => {}
    );
  }
}

// ─── Reading it back ───────────────────────────────────────────

/**
 * Validate a `GrowthAudit.sections` blob on the way out of the database.
 *
 * `sections` is Json, so Prisma types it as `JsonValue` — casting it straight to
 * `AuditContent` would be a lie the renderer pays for, because the column may
 * hold a shape written by an older version of this file. The whole point of
 * choosing Json was that the shape could change without a migration; the cost of
 * that choice is exactly this check.
 *
 * Returns null rather than throwing, so a page can show "this audit can't be
 * displayed" instead of a 500 for one bad row.
 */
export function parseStoredAuditContent(sections: unknown): StoredAuditContent | null {
  const result = StoredAuditContentSchema.safeParse(sections);
  return result.success ? result.data : null;
}

const StoredCitationSchema = z.object({
  title: z.string(),
  quote: z.string().nullish().transform((v) => v ?? null),
  sourceUrl: z.string().nullish().transform((v) => v ?? null),
  sourceName: z.string().nullish().transform((v) => v ?? null),
});

const StoredFindingSchema = z.object({
  area: AuditAreaSchema,
  severity: AuditSeveritySchema,
  effort: AuditEffortSchema,
  title: z.string(),
  observation: z.string(),
  impact: z.string().nullish().transform((v) => v ?? null),
  recommendation: z.string(),
  matchedService: z.string().nullish().transform((v) => v ?? null),
  citations: z.array(StoredCitationSchema).nullish().transform((v) => v ?? []),
});

const StoredAuditContentSchema = z.object({
  findings: z.array(StoredFindingSchema),
  strengths: z.array(z.string()).nullish().transform((v) => v ?? []),
  nextStep: z.string().nullish().transform((v) => v ?? null),
  score: z.object({
    overall: z.number(),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    areas: z.array(
      z.object({
        area: AuditAreaSchema,
        assessed: z.boolean(),
        score: z.number().nullish().transform((v) => v ?? null),
        findingCount: z.number(),
      })
    ),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    confidenceReason: z.string(),
    showScore: z.boolean(),
  }),
  unmatchedFindingCount: z.number().nullish().transform((v) => v ?? 0),
});

export type StoredAuditContent = z.infer<typeof StoredAuditContentSchema>;

/**
 * Validate a `GrowthAudit.brandSnapshot` blob on the way out of the database.
 *
 * Every field is optional because the snapshot is whatever the workspace had
 * filled in at the moment the audit was generated — often almost nothing. The
 * renderer has to cope with an agency that never uploaded a logo, so there is no
 * point pretending otherwise here.
 *
 * Always returns an object. An unreadable snapshot degrades to unbranded rather
 * than failing the page: a plain audit is still worth reading, and the agency
 * would rather their prospect saw it than saw an error.
 */
export function parseBrandSnapshot(snapshot: unknown): AuditBrand {
  const result = BrandSnapshotSchema.safeParse(snapshot);
  return result.success ? result.data : {};
}

// `.partial()` matters as much as the fields: without it every key would be
// required-but-possibly-undefined, and `{}` — which is exactly what a workspace
// with no branding writes — would not satisfy the type.
const BrandSnapshotSchema = z
  .object({
    name: z.string().nullish().transform((v) => v ?? undefined),
    logoUrl: z.string().nullish().transform((v) => v ?? undefined),
    brandColor: z.string().nullish().transform((v) => v ?? undefined),
    senderName: z.string().nullish().transform((v) => v ?? undefined),
    senderTitle: z.string().nullish().transform((v) => v ?? undefined),
    senderEmail: z.string().nullish().transform((v) => v ?? undefined),
    websiteUrl: z.string().nullish().transform((v) => v ?? undefined),
  })
  .partial();

export type AuditBrand = z.infer<typeof BrandSnapshotSchema>;

/**
 * A hex colour the document can safely interpolate into `style`.
 *
 * `brandColor` is free text an agency typed, and it reaches the public page as an
 * inline style on a document strangers open. Anything that is not plainly
 * `#rgb`/`#rrggbb` is discarded rather than sanitised — the fallback is the
 * house blue, which is a fine outcome, and guessing at intent is how a CSS
 * injection gets through.
 */
export function safeBrandColor(color: string | undefined, fallback = "#0071E3"): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback;
}

/**
 * A logo URL safe to put in `<img src>` on a page strangers open.
 *
 * `updateAuditBranding` already refuses anything but http(s) on the way in, so
 * this is the second lock on the same door — worth having because the branding
 * snapshot is frozen JSON that any future code path could write, and the page it
 * feeds has no login in front of it. Returns undefined rather than a placeholder
 * so the renderer falls back to the agency's name.
 */
export function safeLogoUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * How much an `Offer` actually says, used only to choose between several.
 *
 * `services` is weighted heavily because it is the one field that changes the
 * audit's output — `matchService` reads nothing else, and an offer with services
 * but no prose is far more useful here than the reverse.
 */
function offerRichness(offer: {
  description: string | null;
  valueProposition: string | null;
  services: string[];
  targetProblems: string[];
  differentiators: string[];
}): number {
  return (
    offer.services.length * 10 +
    offer.targetProblems.length * 2 +
    offer.differentiators.length +
    (offer.description?.trim() ? 1 : 0) +
    (offer.valueProposition?.trim() ? 1 : 0)
  );
}

/**
 * Snap the model's free-text service to one the agency actually sells.
 *
 * Case-insensitive exact match, then containment either way so "SEO" matches "SEO
 * & Content" and vice versa. Deliberately not fuzzy: a near-miss that resolves to
 * the wrong service puts a recommendation in the audit the agency can't deliver,
 * which is worse than leaving it unmatched and letting `unmatchedFindingCount`
 * say so.
 */
function matchService(candidate: string | null | undefined, services: string[]): string | null {
  if (!candidate || services.length === 0) return null;

  const needle = candidate.trim().toLowerCase();
  if (!needle) return null;

  const exact = services.find((s) => s.trim().toLowerCase() === needle);
  if (exact) return exact;

  const partial = services.find((s) => {
    const hay = s.trim().toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });

  return partial ?? null;
}

const auditSchemaDefinition = `
{
  "headline": "One plain sentence naming the single most valuable thing they could fix",
  "summary": "Two or three sentences: what you looked at, and the overall picture",
  "strengths": ["Two or three things that are genuinely working, stated specifically"],
  "findings": [
    {
      "area": "POSITIONING | ACQUISITION | CONVERSION | DELIVERY | RETENTION | TECHNOLOGY",
      "severity": "HIGH | MEDIUM | LOW",
      "effort": "QUICK_WIN | PROJECT | ONGOING",
      "title": "A short plain statement of the observation",
      "observation": "What you actually saw, naming the specific thing",
      "impact": "What it is costing them, concretely",
      "recommendation": "What you would do about it",
      "evidenceIds": ["the id of each piece of evidence this rests on"],
      "matchedService": "which of the services listed below would fix this"
    }
  ],
  "nextStep": "One specific, small ask to close on"
}
`;

function buildAuditPrompt(input: {
  company: {
    name: string;
    domain: string | null;
    description: string | null;
    industry: string | null;
    businessModel: string | null;
    employeeRange: string | null;
    employeeCount: number | null;
    foundedYear: number | null;
    headquarters: string | null;
    technologies: string[];
    evidence: {
      id: string;
      title: string;
      summary: string;
      quote: string | null;
      sourceUrl: string | null;
      sourceName: string | null;
    }[];
    signals: { type: string; title: string; description: string | null }[];
  };
  offer: {
    name: string;
    description: string | null;
    valueProposition: string | null;
    services: string[];
    targetProblems: string[];
    differentiators: string[];
  } | null;
  services: string[];
}) {
  const { company, offer, services } = input;

  // Evidence with its quote and source url attached, not flattened to a summary.
  // The quote is the single most specific artefact in the whole pipeline and the
  // only thing that lets a finding say "your careers page says X".
  const evidenceBlock =
    company.evidence.length > 0
      ? company.evidence
          .map((e) =>
            [
              `- id: ${e.id}`,
              `  what: ${e.title} — ${e.summary}`,
              e.quote ? `  exact words: "${e.quote}"` : null,
              e.sourceUrl ? `  source: ${e.sourceName ?? "web"} (${e.sourceUrl})` : null,
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n")
      : "(none gathered — say less, and do not invent any)";

  const signalBlock =
    company.signals.length > 0
      ? company.signals
          .map((s) => `- [${s.type}] ${s.title}${s.description ? ` — ${s.description}` : ""}`)
          .join("\n")
      : "(none)";

  const firmographics = [
    company.industry ? `Industry: ${company.industry}` : null,
    company.businessModel ? `Business model: ${company.businessModel}` : null,
    company.employeeRange || company.employeeCount
      ? `Headcount: ${company.employeeRange ?? company.employeeCount}`
      : null,
    company.foundedYear ? `Founded: ${company.foundedYear}` : null,
    company.headquarters ? `Based in: ${company.headquarters}` : null,
    company.technologies.length > 0 ? `Tech we can see: ${company.technologies.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // When the offer has no structured fields the model has nothing to recommend
  // *from*, and the honest thing is to tell it to observe and stay quiet about
  // solutions rather than invent a service the agency doesn't sell.
  const offerBlock = offer
    ? [
        `Name: ${offer.name}`,
        offer.valueProposition ? `What we promise: ${offer.valueProposition}` : null,
        offer.description ? `About us: ${offer.description}` : null,
        services.length > 0 ? `Services we can actually deliver: ${services.join(", ")}` : null,
        offer.targetProblems.length > 0
          ? `Problems we usually solve: ${offer.targetProblems.join(", ")}`
          : null,
        offer.differentiators.length > 0
          ? `What makes us different: ${offer.differentiators.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(not configured)";

  const serviceRule =
    services.length > 0
      ? `Set "matchedService" to whichever of these fixes the finding, copied exactly: ${services.join(", ")}. If none of them fits, leave it null — do not stretch one to fit.`
      : `We have no service list configured, so leave "matchedService" null on every finding and keep each recommendation to what they should do, not what we would sell.`;

  return `
You are writing a short growth audit that a consultancy will send directly to the business it is about. The person reading it runs ${company.name}. They did not ask for this, so it has to earn attention in the first two lines by telling them something true and specific about their own business that they will recognise.

THE BUSINESS
${company.name}${company.domain ? ` (${company.domain})` : ""}
${company.description ?? ""}
${firmographics}

WHAT WE FOUND — every factual claim you make must come from here
${evidenceBlock}

SIGNALS
${signalBlock}

WHO IS SENDING THIS
${offerBlock}

HOW TO WRITE IT
1. Write to them as "you". Never mention that this was generated, never name any tool, and never refer to them as a lead, a prospect, a target or an opportunity.
2. Every factual claim traces to the evidence above, and you list the ids you used in "evidenceIds". If you cannot support a claim with an id, either cut it or write it plainly as an inference ("it looks like...", "we could not find..."). Never invent a statistic, a customer name, a person's name, or a number.
3. Be specific over comprehensive. Three findings they recognise beat eight generic ones. Prefer the thing you can actually point at over the thing that sounds important.
4. Name two or three real strengths first. An audit that is only criticism reads as an attack and gets deleted, and it is also untrue — this business is working well enough to exist.
5. At least one finding should be a QUICK_WIN they could act on this week without hiring anyone. That is what earns a reply.
6. ${serviceRule}
7. Plain, direct language. Short sentences. No consulting register: do not write "we propose", "our recommendation is", "partnership opportunity", "leverage", "synergies", "best-in-class", "unlock", "in today's landscape", "it's no secret that", or "I noticed you recently". Write the way a person who has actually looked at their website would talk.
8. Nothing about how easy they would be to sell to. No fit scores, no mention of budget, no note about who the decision maker is. They are reading this about themselves.

HERE IS THE VOICE, roughly
{
  "area": "CONVERSION",
  "severity": "HIGH",
  "effort": "QUICK_WIN",
  "title": "Your pricing page asks for a call before it says a number",
  "observation": "Every plan on /pricing ends in 'Contact sales'. Your two closest competitors both publish starting prices.",
  "impact": "Buyers comparing three vendors on a Friday afternoon will shortlist the two who told them what it costs.",
  "recommendation": "Publish a starting price or a range on the two lower tiers and keep 'Contact sales' for enterprise only.",
  "evidenceIds": ["ev_abc123"],
  "matchedService": "Conversion Optimization"
}

Return valid JSON matching this schema exactly:
${auditSchemaDefinition}
  `.trim();
}

/**
 * Three attempts with a widening pause, matching `extractCompanyData` and
 * `searchForTargetsWithAI`. Temperature is a little above those two because an
 * audit is prose a human reads rather than fields to fill, and 0.2 makes every
 * audit sound like the same template.
 *
 * Which model answers is decided in `kimi.ts`: the reasoning model when it is
 * configured, Groq otherwise. The retry loop belongs here either way — the
 * vendor wrapper deliberately does not retry, so three attempts stay three
 * attempts instead of nine.
 */
async function callModelWithRetries(prompt: string, label: string): Promise<string> {
  const maxRetries = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = await completeJsonObject("audit", prompt, 0.4);
      if (content) return content;

      lastError = new Error("the model returned an empty response");
    } catch (err) {
      lastError = err;
      console.warn(`Growth audit attempt ${attempt} failed for ${label}:`, err);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(
    `Growth audit failed for ${label} after ${maxRetries} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
