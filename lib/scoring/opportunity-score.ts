/**
 * Opportunity Scoring Engine
 * 
 * Weighted scoring model for opportunity qualification.
 * All weights are defined here for easy tuning.
 */

export const SCORE_WEIGHTS = {
  icpFit: 0.20,           // 20% — does this company match our ideal profile?
  problemEvidence: 0.25,  // 25% — is there real evidence of the problem we solve?
  buyingIntent: 0.20,     // 20% — signals that they're actively looking for a solution
  serviceMatch: 0.15,     // 15% — how well does our offer match their need?
  buyerConfidence: 0.10,  // 10% — how confident are we about the decision maker?
  contactability: 0.10,   // 10% — can we actually reach the buyer?
} as const;

export interface ScoreInput {
  icpFit: number;           // 0-100
  problemEvidence: number;  // 0-100
  buyingIntent: number;     // 0-100
  serviceMatch: number;     // 0-100
  buyerConfidence: number;  // 0-100
  contactability: number;   // 0-100
}

export interface ScoreResult extends ScoreInput {
  overall: number;           // 0-100 weighted composite
  grade: "A" | "B" | "C" | "D" | "F";
  qualifies: boolean;        // overall >= QUALIFICATION_THRESHOLD
}

export const QUALIFICATION_THRESHOLD = 60; // Score needed to qualify

export function calculateOpportunityScore(input: ScoreInput): ScoreResult {
  const overall =
    input.icpFit * SCORE_WEIGHTS.icpFit +
    input.problemEvidence * SCORE_WEIGHTS.problemEvidence +
    input.buyingIntent * SCORE_WEIGHTS.buyingIntent +
    input.serviceMatch * SCORE_WEIGHTS.serviceMatch +
    input.buyerConfidence * SCORE_WEIGHTS.buyerConfidence +
    input.contactability * SCORE_WEIGHTS.contactability;

  const rounded = Math.round(overall * 10) / 10;

  return {
    ...input,
    overall: rounded,
    grade: getGrade(rounded),
    qualifies: rounded >= QUALIFICATION_THRESHOLD,
  };
}

export function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Colours for a score, keyed to the grade so the two never disagree.
 *
 * These were `text-emerald-400` / `text-amber-400` / `text-red-400` — Tailwind's
 * 400 weights, which are meant for dark backgrounds. This app renders on
 * `#F5F5F7` and white, where a 400 weight sits at roughly 2:1 contrast and is
 * hard to read. The values below are Apple's accessible system colours for
 * light backgrounds, which is the palette the rest of the UI already uses.
 *
 * They were also on their own threshold ladder (80/65/50/35) while `getGrade`
 * used 85/70/55/40, so a score of 82 displayed as an "A" in blue but was graded
 * B. One ladder now.
 */
const GRADE_TEXT_COLORS = {
  A: "text-[#0071E3]", // systemBlue
  B: "text-[#248A3D]", // systemGreen, accessible-light
  C: "text-[#B25000]", // systemYellow, accessible-light (the raw #FFCC00 is unreadable on white)
  D: "text-[#C93400]", // systemOrange, accessible-light
  F: "text-[#D70015]", // systemRed, accessible-light
} as const;

const GRADE_BG_COLORS = {
  A: "bg-[#0071E3]/10 border-[#0071E3]/20",
  B: "bg-[#248A3D]/10 border-[#248A3D]/20",
  C: "bg-[#B25000]/10 border-[#B25000]/20",
  D: "bg-[#C93400]/10 border-[#C93400]/20",
  F: "bg-[#D70015]/10 border-[#D70015]/20",
} as const;

export function getScoreColor(score: number): string {
  return GRADE_TEXT_COLORS[getGrade(score)];
}

export function getScoreBgColor(score: number): string {
  return GRADE_BG_COLORS[getGrade(score)];
}
