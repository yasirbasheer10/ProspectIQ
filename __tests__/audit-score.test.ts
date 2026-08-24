/**
 * Tests: Growth Audit scoring (`lib/scoring/audit-score.ts`)
 *
 * This number is printed on a document the agency sends to their own prospect, so
 * the properties worth pinning down are the ones that would embarrass them: that
 * the score is reproducible, that an area nobody looked at is never reported as
 * perfect, and that a thin audit says so instead of dressing itself up.
 *
 * No mocks — the module imports a type and one const array and nothing else.
 */

import {
  calculateAuditScore,
  SEVERITY_DEDUCTIONS,
  AUDIT_SCORE_FLOOR,
  AUDIT_AREA_LABELS,
  type AuditScoreInput,
} from "@/lib/scoring/audit-score";
import { AUDIT_AREAS } from "@/lib/ai/schemas";

/** Enough evidence and citations to clear the HIGH-confidence bar. */
const WELL_EVIDENCED = { evidenceCount: 10, signalCount: 2, findingsCitingEvidence: 99 };

function score(
  findings: AuditScoreInput["findings"],
  overrides: Partial<Omit<AuditScoreInput, "findings">> = {}
) {
  return calculateAuditScore({
    findings,
    evidenceCount: WELL_EVIDENCED.evidenceCount,
    signalCount: WELL_EVIDENCED.signalCount,
    // Default to every finding citing something, so tests that are not about
    // confidence do not accidentally trip the LOW branch.
    findingsCitingEvidence: findings.length,
    ...overrides,
  });
}

describe("calculateAuditScore — the overall", () => {
  it("is deterministic: the same findings always give the same number", () => {
    const findings: AuditScoreInput["findings"] = [
      { area: "POSITIONING", severity: "HIGH" },
      { area: "CONVERSION", severity: "MEDIUM" },
      { area: "TECHNOLOGY", severity: "LOW" },
    ];
    const runs = Array.from({ length: 20 }, () => score(findings).overall);
    expect(new Set(runs).size).toBe(1);
  });

  it("starts at 100 and deducts by severity", () => {
    expect(score([]).overall).toBe(100);
    expect(score([{ area: "POSITIONING", severity: "HIGH" }]).overall).toBe(
      100 - SEVERITY_DEDUCTIONS.HIGH
    );
    expect(score([{ area: "POSITIONING", severity: "MEDIUM" }]).overall).toBe(
      100 - SEVERITY_DEDUCTIONS.MEDIUM
    );
    expect(score([{ area: "POSITIONING", severity: "LOW" }]).overall).toBe(
      100 - SEVERITY_DEDUCTIONS.LOW
    );
  });

  it("costs a HIGH finding roughly twice a MEDIUM, and a LOW barely anything", () => {
    // The tuning claim in the module header, pinned so a later edit to the
    // constants has to be deliberate.
    expect(SEVERITY_DEDUCTIONS.HIGH).toBe(SEVERITY_DEDUCTIONS.MEDIUM * 2);
    expect(SEVERITY_DEDUCTIONS.LOW).toBeLessThan(SEVERITY_DEDUCTIONS.MEDIUM / 2);
  });

  it("never drops below the floor, however many problems are found", () => {
    const twentyHighs: AuditScoreInput["findings"] = Array.from({ length: 20 }, () => ({
      area: "POSITIONING" as const,
      severity: "HIGH" as const,
    }));
    expect(score(twentyHighs).overall).toBe(AUDIT_SCORE_FLOOR);
    expect(score(twentyHighs).overall).toBeGreaterThan(0);
  });

  it("lands a realistic audit in a believable band", () => {
    // Three to six findings is what the model typically returns; the header
    // claims that spans roughly 30-90. A score outside that means the
    // deductions have drifted and every audit will read wrong.
    const realistic = score([
      { area: "POSITIONING", severity: "HIGH" },
      { area: "CONVERSION", severity: "MEDIUM" },
      { area: "ACQUISITION", severity: "MEDIUM" },
      { area: "TECHNOLOGY", severity: "LOW" },
    ]);
    expect(realistic.overall).toBeGreaterThanOrEqual(30);
    expect(realistic.overall).toBeLessThanOrEqual(90);
  });

  it("gives a grade consistent with the number", () => {
    expect(score([]).grade).toBe("A");
    expect(
      score(Array.from({ length: 20 }, () => ({ area: "POSITIONING" as const, severity: "HIGH" as const })))
        .grade
    ).toBe("F");
  });
});

describe("calculateAuditScore — the areas", () => {
  it("returns all six areas in a stable order whether or not they were assessed", () => {
    const result = score([{ area: "CONVERSION", severity: "HIGH" }]);
    expect(result.areas.map((a) => a.area)).toEqual([...AUDIT_AREAS]);
  });

  it("never scores an area nothing was found in — the honesty rule", () => {
    // The bug this file exists to prevent: an area with no findings scoring 100
    // and the agency emailing "your retention scores 100/100" off a homepage.
    const result = score([{ area: "CONVERSION", severity: "HIGH" }]);

    for (const area of result.areas) {
      if (area.area === "CONVERSION") {
        expect(area.assessed).toBe(true);
        expect(area.score).not.toBeNull();
        expect(area.findingCount).toBe(1);
      } else {
        expect(area.assessed).toBe(false);
        expect(area.score).toBeNull();
        expect(area.findingCount).toBe(0);
      }
    }
  });

  it("deducts three times harder inside an area than overall", () => {
    const result = score([{ area: "DELIVERY", severity: "MEDIUM" }]);
    const delivery = result.areas.find((a) => a.area === "DELIVERY")!;
    expect(delivery.score).toBe(100 - SEVERITY_DEDUCTIONS.MEDIUM * 3);
    expect(result.overall).toBe(100 - SEVERITY_DEDUCTIONS.MEDIUM);
  });

  it("floors an area score too", () => {
    const result = score([
      { area: "RETENTION", severity: "HIGH" },
      { area: "RETENTION", severity: "HIGH" },
      { area: "RETENTION", severity: "HIGH" },
    ]);
    const retention = result.areas.find((a) => a.area === "RETENTION")!;
    expect(retention.score).toBe(AUDIT_SCORE_FLOOR);
    expect(retention.findingCount).toBe(3);
  });

  it("has a label for every area, so the scorecard can never render a raw enum", () => {
    for (const area of AUDIT_AREAS) {
      expect(AUDIT_AREA_LABELS[area]).toBeTruthy();
      expect(AUDIT_AREA_LABELS[area]).not.toBe(area);
    }
  });
});

describe("calculateAuditScore — confidence", () => {
  const threeFindings: AuditScoreInput["findings"] = [
    { area: "POSITIONING", severity: "HIGH" },
    { area: "CONVERSION", severity: "MEDIUM" },
    { area: "ACQUISITION", severity: "LOW" },
  ];

  it("is HIGH on plenty of evidence that the findings actually cite", () => {
    const result = score(threeFindings, { evidenceCount: 8, findingsCitingEvidence: 3 });
    expect(result.confidence).toBe("HIGH");
    expect(result.showScore).toBe(true);
  });

  it("is MEDIUM on a moderate amount", () => {
    const result = score(threeFindings, { evidenceCount: 4, findingsCitingEvidence: 2 });
    expect(result.confidence).toBe("MEDIUM");
    expect(result.showScore).toBe(true);
  });

  it("is LOW when there is no evidence at all, and says to research first", () => {
    const result = score(threeFindings, { evidenceCount: 0, findingsCitingEvidence: 0 });
    expect(result.confidence).toBe("LOW");
    expect(result.showScore).toBe(false);
    expect(result.confidenceReason).toMatch(/no evidence/i);
  });

  it("is LOW on plenty of evidence that nothing cites — volume is not grounding", () => {
    // Twenty evidence rows and not one citation means the model wrote from the
    // general shape of the company. That is the audit that gets the agency asked
    // "where did you see that?".
    const result = score(threeFindings, { evidenceCount: 20, findingsCitingEvidence: 0 });
    expect(result.confidence).toBe("LOW");
    expect(result.showScore).toBe(false);
  });

  it("hides the headline score exactly when confidence is LOW", () => {
    for (const evidenceCount of [0, 1, 3, 6, 12]) {
      for (const cited of [0, 1, 2, 3]) {
        const result = score(threeFindings, { evidenceCount, findingsCitingEvidence: cited });
        expect(result.showScore).toBe(result.confidence !== "LOW");
      }
    }
  });

  it("does not divide by zero when there are no findings", () => {
    const result = score([], { evidenceCount: 0, findingsCitingEvidence: 0 });
    expect(Number.isFinite(result.overall)).toBe(true);
    expect(result.confidence).toBe("LOW");
  });

  it("writes the reason for the agency, never mentioning ProspectIQ to the prospect", () => {
    for (const evidenceCount of [0, 2, 5, 10]) {
      const result = score(threeFindings, { evidenceCount, findingsCitingEvidence: 2 });
      expect(result.confidenceReason).toBeTruthy();
      expect(result.confidenceReason).not.toMatch(/prospectiq/i);
    }
  });
});
