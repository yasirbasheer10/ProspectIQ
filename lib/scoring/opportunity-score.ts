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

function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 65) return "text-teal-400";
  if (score >= 50) return "text-amber-400";
  if (score >= 35) return "text-orange-400";
  return "text-red-400";
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 65) return "bg-teal-500/10 border-teal-500/20";
  if (score >= 50) return "bg-amber-500/10 border-amber-500/20";
  if (score >= 35) return "bg-orange-500/10 border-orange-500/20";
  return "bg-red-500/10 border-red-500/20";
}
