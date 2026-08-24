/**
 * Growth Audit scoring.
 *
 * Computed in code, not asked of the model — same reasoning as `icp-fit.ts`. The
 * number goes in front of the agency's own prospect, so two audits of comparably
 * healthy companies must not disagree because the model was in a different mood,
 * and the agency has to be able to answer "where did 68 come from?" without
 * shrugging.
 *
 * **This is not `opportunity-score.ts` and must never be confused with it.** That
 * one measures how easy a company is to sell to — ICP fit, buyer confidence,
 * contactability — and showing a prospect their own contactability score would
 * end the relationship rather than start it. This one measures the prospect's
 * business as the prospect would recognise it.
 *
 * ── The honesty problem this file exists to solve ─────────────────────────────
 *
 * The obvious implementation starts every area at 100 and deducts for problems.
 * That quietly asserts something false: an area with no findings scores a perfect
 * 100, when the real reason there are no findings is usually that we scraped one
 * marketing page and never saw anything about it. An agency emailing a prospect
 * "your retention scores 100/100" off the back of a homepage scrape gets caught,
 * and it is their reputation that pays, not ours.
 *
 * So an area is scored only when something was actually found in it, and is
 * reported `assessed: false` otherwise. `confidence` says how much the whole
 * thing rests on, and the caller is expected to suppress the headline number
 * entirely when it comes back LOW.
 *
 * The single import is `import type` plus one const array, both erased or inlined
 * at build time; the rest of `lib/scoring` deliberately depends on nothing, and
 * this keeps that true in spirit while stopping the area list from drifting away
 * from the zod enum that validates it.
 */

import { AUDIT_AREAS, type AuditArea, type AuditSeverity } from "@/lib/ai/schemas";
import { getGrade } from "./opportunity-score";

/**
 * What each severity takes off the overall.
 *
 * Tuned so a realistic audit lands in a believable band: the model typically
 * returns three to six findings, which is 12 to ~90 points of deduction, i.e. a
 * spread of roughly 30-90. A single HIGH finding costs about twice a MEDIUM, and
 * a LOW is close to a rounding error on purpose — padding an audit with trivia
 * shouldn't be able to tank the score.
 */
export const SEVERITY_DEDUCTIONS: Record<AuditSeverity, number> = {
  HIGH: 18,
  MEDIUM: 9,
  LOW: 4,
};

/**
 * The overall never goes below this.
 *
 * Not kindness — credibility. A real trading business with customers and staff
 * does not score 4/100, and a number that low reads as a sales gimmick, gets
 * argued with, and takes the rest of the document down with it. Clamping keeps
 * the score a signal rather than an insult.
 */
export const AUDIT_SCORE_FLOOR = 25;

export type AuditConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface AuditScoreInput {
  /** Only the two fields that affect the score — pass the findings as they are. */
  findings: { area: AuditArea; severity: AuditSeverity }[];
  /** `Evidence` rows the audit was built from. Drives confidence, not the score. */
  evidenceCount: number;
  /** `Signal` rows for the company. Also confidence only. */
  signalCount: number;
  /** How many findings cited at least one real evidence id. */
  findingsCitingEvidence: number;
}

export interface AuditAreaScore {
  area: AuditArea;
  /** False when nothing was found here — which is not the same as nothing being wrong. */
  assessed: boolean;
  /** Null when `assessed` is false. Never render a bar for a null. */
  score: number | null;
  findingCount: number;
}

export interface AuditScoreResult {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  /** All six areas, in a stable order, assessed or not. */
  areas: AuditAreaScore[];
  confidence: AuditConfidence;
  /**
   * Plain-language reason for the confidence, written for the agency reviewing
   * the audit before they send it — not for the prospect.
   */
  confidenceReason: string;
  /** Convenience for the UI: `confidence` is at least MEDIUM. */
  showScore: boolean;
}

/**
 * Score one audit.
 *
 * Deterministic: same findings in, same numbers out, no clock and no randomness,
 * so it is straightforward to test and to explain to a client who challenges it.
 */
export function calculateAuditScore(input: AuditScoreInput): AuditScoreResult {
  const { findings, evidenceCount, signalCount, findingsCitingEvidence } = input;

  // ── Overall ────────────────────────────────────────────────────────────────
  const totalDeduction = findings.reduce(
    (sum, f) => sum + (SEVERITY_DEDUCTIONS[f.severity] ?? SEVERITY_DEDUCTIONS.MEDIUM),
    0
  );
  const overall = Math.max(AUDIT_SCORE_FLOOR, Math.round(100 - totalDeduction));

  // ── Per area ───────────────────────────────────────────────────────────────
  // Every area is listed so the scorecard has a stable shape, but only the ones
  // with findings carry a number. An area deducts from its own 100 at three times
  // the overall rate, because a single HIGH finding in one narrow area really is
  // most of what there is to say about that area.
  const areas: AuditAreaScore[] = AUDIT_AREAS.map((area) => {
    const inArea = findings.filter((f) => f.area === area);

    if (inArea.length === 0) {
      return { area, assessed: false, score: null, findingCount: 0 };
    }

    const areaDeduction = inArea.reduce(
      (sum, f) => sum + (SEVERITY_DEDUCTIONS[f.severity] ?? SEVERITY_DEDUCTIONS.MEDIUM) * 3,
      0
    );

    return {
      area,
      assessed: true,
      score: Math.max(AUDIT_SCORE_FLOOR, Math.round(100 - areaDeduction)),
      findingCount: inArea.length,
    };
  });

  // ── Confidence ─────────────────────────────────────────────────────────────
  const { confidence, confidenceReason } = assessConfidence({
    findingCount: findings.length,
    evidenceCount,
    signalCount,
    findingsCitingEvidence,
  });

  return {
    overall,
    grade: getGrade(overall),
    areas,
    confidence,
    confidenceReason,
    showScore: confidence !== "LOW",
  };
}

/**
 * How much the audit actually rests on.
 *
 * Deliberately strict about citations rather than volume: twenty evidence rows
 * that no finding refers to mean the model wrote from the general shape of the
 * company rather than from anything specific, and that is exactly the audit that
 * embarrasses the agency when the prospect asks "where did you see that?".
 */
function assessConfidence(input: {
  findingCount: number;
  evidenceCount: number;
  signalCount: number;
  findingsCitingEvidence: number;
}): { confidence: AuditConfidence; confidenceReason: string } {
  const { findingCount, evidenceCount, signalCount, findingsCitingEvidence } = input;

  const citedShare = findingCount === 0 ? 0 : findingsCitingEvidence / findingCount;

  if (evidenceCount >= 6 && citedShare >= 0.5) {
    return {
      confidence: "HIGH",
      confidenceReason: `Built on ${evidenceCount} pieces of evidence and ${signalCount} signal(s), with ${findingsCitingEvidence} of ${findingCount} findings citing a source.`,
    };
  }

  if (evidenceCount >= 3 && citedShare >= 0.34) {
    return {
      confidence: "MEDIUM",
      confidenceReason: `Built on ${evidenceCount} pieces of evidence, with ${findingsCitingEvidence} of ${findingCount} findings citing a source. Worth reading through before you send it.`,
    };
  }

  if (evidenceCount === 0) {
    return {
      confidence: "LOW",
      confidenceReason:
        "No evidence was gathered for this company, so the findings rest on the website copy alone. Research the company first, then regenerate.",
    };
  }

  return {
    confidence: "LOW",
    confidenceReason: `Only ${evidenceCount} piece(s) of evidence, and ${findingsCitingEvidence} of ${findingCount} findings cite a source. Treat the findings as prompts for your own review rather than something to send as-is.`,
  };
}

/** Human-readable area names for the scorecard. */
export const AUDIT_AREA_LABELS: Record<AuditArea, string> = {
  POSITIONING: "Positioning & Messaging",
  ACQUISITION: "Customer Acquisition",
  CONVERSION: "Conversion",
  DELIVERY: "Delivery & Capacity",
  RETENTION: "Retention",
  TECHNOLOGY: "Technology",
};
