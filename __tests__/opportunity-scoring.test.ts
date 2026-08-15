/**
 * Tests: Opportunity Scoring Engine
 */

import {
  calculateOpportunityScore,
  SCORE_WEIGHTS,
  QUALIFICATION_THRESHOLD,
  type ScoreInput,
} from "@/lib/scoring/opportunity-score";

describe("calculateOpportunityScore", () => {
  const perfectInput: ScoreInput = {
    icpFit: 100,
    problemEvidence: 100,
    buyingIntent: 100,
    serviceMatch: 100,
    buyerConfidence: 100,
    contactability: 100,
  };

  const zeroInput: ScoreInput = {
    icpFit: 0,
    problemEvidence: 0,
    buyingIntent: 0,
    serviceMatch: 0,
    buyerConfidence: 0,
    contactability: 0,
  };

  it("returns 100 for perfect scores", () => {
    const result = calculateOpportunityScore(perfectInput);
    expect(result.overall).toBe(100);
  });

  it("returns 0 for zero scores", () => {
    const result = calculateOpportunityScore(zeroInput);
    expect(result.overall).toBe(0);
  });

  it("weights sum to 1.0", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("applies weights correctly for the demo opportunity", () => {
    const demoInput: ScoreInput = {
      icpFit: 88,
      problemEvidence: 82,
      buyingIntent: 76,
      serviceMatch: 90,
      buyerConfidence: 85,
      contactability: 78,
    };
    const result = calculateOpportunityScore(demoInput);
    // Manual calculation:
    const expected =
      88 * 0.20 +
      82 * 0.25 +
      76 * 0.20 +
      90 * 0.15 +
      85 * 0.10 +
      78 * 0.10;
    expect(result.overall).toBeCloseTo(expected, 0);
  });

  it("assigns grade A for score >= 85", () => {
    const result = calculateOpportunityScore(perfectInput);
    expect(result.grade).toBe("A");
  });

  it("assigns grade B for score 70-84", () => {
    const input: ScoreInput = {
      icpFit: 75,
      problemEvidence: 75,
      buyingIntent: 75,
      serviceMatch: 75,
      buyerConfidence: 75,
      contactability: 75,
    };
    const result = calculateOpportunityScore(input);
    expect(result.grade).toBe("B");
  });

  it("assigns grade F for score < 40", () => {
    const result = calculateOpportunityScore(zeroInput);
    expect(result.grade).toBe("F");
  });

  it(`qualifies when overall >= ${QUALIFICATION_THRESHOLD}`, () => {
    const input: ScoreInput = {
      icpFit: 70,
      problemEvidence: 70,
      buyingIntent: 70,
      serviceMatch: 70,
      buyerConfidence: 70,
      contactability: 70,
    };
    const result = calculateOpportunityScore(input);
    expect(result.qualifies).toBe(result.overall >= QUALIFICATION_THRESHOLD);
  });

  it("does not qualify when overall < threshold", () => {
    const result = calculateOpportunityScore(zeroInput);
    expect(result.qualifies).toBe(false);
  });

  it("passes through all input dimensions", () => {
    const result = calculateOpportunityScore(perfectInput);
    expect(result.icpFit).toBe(100);
    expect(result.problemEvidence).toBe(100);
    expect(result.buyingIntent).toBe(100);
    expect(result.serviceMatch).toBe(100);
    expect(result.buyerConfidence).toBe(100);
    expect(result.contactability).toBe(100);
  });
});
