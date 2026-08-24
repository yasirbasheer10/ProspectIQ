/**
 * Tests: deterministic firmographic ICP fit
 *
 * The point of `computeIcpFit` is reproducibility, so the first thing these
 * tests pin down is that the same input always gives the same output. The rest
 * cover the three design rules from the module header: missing data is not a
 * mismatch, unconstrained dimensions are dropped, and nothing-to-compare
 * returns `null` rather than a made-up number.
 */

import {
  computeIcpFit,
  resolveHeadcount,
  type IcpFitCompany,
  type IcpFitCriteria,
} from "@/lib/scoring/icp-fit";

const ICP: IcpFitCriteria = {
  industries: ["SaaS", "E-commerce"],
  excludedIndustries: ["Defense"],
  companySizeMin: 50,
  companySizeMax: 500,
  geographies: ["United States", "Canada"],
  regions: [],
};

const PERFECT: IcpFitCompany = {
  industry: "SaaS",
  employeeCount: 200,
  country: "United States",
};

describe("computeIcpFit", () => {
  it("is deterministic — the same input always gives the same score", () => {
    const runs = Array.from({ length: 20 }, () => computeIcpFit(PERFECT, ICP)?.score);
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBe(100);
  });

  it("scores a company matching every dimension at 100", () => {
    const result = computeIcpFit(PERFECT, ICP);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.excluded).toBe(false);
    expect(result!.dimensions).toHaveLength(3);
  });

  it("scores a company matching no dimension at 0", () => {
    const result = computeIcpFit(
      { industry: "Manufacturing", employeeCount: 4, country: "Japan" },
      ICP
    );
    expect(result!.score).toBe(0);
  });

  // ── Rule 3: nothing to compare returns null ────────────────────────────────

  it("returns null when there is no ICP", () => {
    expect(computeIcpFit(PERFECT, null)).toBeNull();
    expect(computeIcpFit(PERFECT, undefined)).toBeNull();
  });

  it("returns null when the ICP constrains none of the three dimensions", () => {
    expect(computeIcpFit(PERFECT, { industries: [], geographies: [] })).toBeNull();
  });

  it("returns null when the company has no firmographics at all", () => {
    expect(computeIcpFit({}, ICP)).toBeNull();
    expect(computeIcpFit({ industry: null, employeeCount: null, country: null }, ICP)).toBeNull();
  });

  // ── Rule 1: missing data is not a mismatch ─────────────────────────────────

  it("does not penalise a company for data we simply do not have", () => {
    // Industry and country match; headcount is unknown. Dropping the size
    // dimension should leave a perfect score, not 70.
    const result = computeIcpFit({ industry: "SaaS", country: "Canada" }, ICP);
    expect(result!.score).toBe(100);
    expect(result!.dimensions.map((d) => d.name)).toEqual(["industry", "geography"]);
  });

  it("re-normalises weights so a dropped dimension cannot cap the maximum", () => {
    const result = computeIcpFit({ industry: "SaaS" }, ICP);
    expect(result!.dimensions).toHaveLength(1);
    expect(result!.dimensions[0].weight).toBeCloseTo(1, 10);
    expect(result!.score).toBe(100);
  });

  // ── Rule 2: unconstrained dimensions are dropped ───────────────────────────

  it("does not judge geography when the ICP names none", () => {
    const result = computeIcpFit(PERFECT, { ...ICP, geographies: [], regions: [] });
    expect(result!.dimensions.map((d) => d.name)).toEqual(["industry", "size"]);
    expect(result!.score).toBe(100);
  });

  it("does not judge a company in Latvia against an ICP with no geography", () => {
    const result = computeIcpFit(
      { industry: "SaaS", employeeCount: 200, country: "Latvia" },
      { industries: ["SaaS"], companySizeMin: 50, companySizeMax: 500 }
    );
    expect(result!.score).toBe(100);
  });

  // ── Exclusion is a veto ────────────────────────────────────────────────────

  it("vetoes an excluded industry regardless of the other dimensions", () => {
    const result = computeIcpFit(
      { industry: "Defense", employeeCount: 200, country: "United States" },
      ICP
    );
    expect(result!.excluded).toBe(true);
    expect(result!.score).toBe(0);
    expect(result!.reasons[0]).toMatch(/exclusion list/);
  });

  it("catches an excluded industry recorded on the sub-industry", () => {
    const result = computeIcpFit(
      { industry: "Technology", subIndustry: "Defense", employeeCount: 200, country: "Canada" },
      ICP
    );
    expect(result!.excluded).toBe(true);
    expect(result!.score).toBe(0);
  });

  // ── Industry matching ──────────────────────────────────────────────────────

  it("matches industry regardless of case and punctuation", () => {
    expect(computeIcpFit({ industry: "  e-commerce  " }, ICP)!.score).toBe(100);
    expect(computeIcpFit({ industry: "E Commerce" }, ICP)!.score).toBe(100);
  });

  it("gives partial credit for a broader industry label", () => {
    // "B2B SaaS" is not literally "SaaS" but should not score 0.
    const exact = computeIcpFit({ industry: "SaaS" }, ICP)!.score;
    const partial = computeIcpFit({ industry: "B2B SaaS" }, ICP)!.score;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(exact);
  });

  it("takes the better of industry and sub-industry", () => {
    const result = computeIcpFit({ industry: "Technology", subIndustry: "E-commerce" }, ICP);
    expect(result!.score).toBe(100);
  });

  // ── Size matching ──────────────────────────────────────────────────────────

  it("scores inside the band at 100 and at the boundaries too", () => {
    for (const employeeCount of [50, 200, 500]) {
      expect(computeIcpFit({ employeeCount }, { companySizeMin: 50, companySizeMax: 500 })!.score)
        .toBe(100);
    }
  });

  it("decays below the minimum instead of cliff-edging to zero", () => {
    const band = { companySizeMin: 50, companySizeMax: 500 };
    const nearMiss = computeIcpFit({ employeeCount: 45 }, band)!.score;
    const farMiss = computeIcpFit({ employeeCount: 30 }, band)!.score;
    expect(nearMiss).toBeGreaterThan(farMiss);
    expect(farMiss).toBeGreaterThan(0);
    // Zero at half the minimum.
    expect(computeIcpFit({ employeeCount: 25 }, band)!.score).toBe(0);
    expect(computeIcpFit({ employeeCount: 5 }, band)!.score).toBe(0);
  });

  it("decays above the maximum and reaches zero at twice it", () => {
    const band = { companySizeMin: 50, companySizeMax: 500 };
    expect(computeIcpFit({ employeeCount: 600 }, band)!.score).toBeGreaterThan(0);
    expect(computeIcpFit({ employeeCount: 600 }, band)!.score).toBeLessThan(100);
    expect(computeIcpFit({ employeeCount: 1000 }, band)!.score).toBe(0);
    expect(computeIcpFit({ employeeCount: 50000 }, band)!.score).toBe(0);
  });

  it("handles a one-sided band", () => {
    expect(computeIcpFit({ employeeCount: 9000 }, { companySizeMin: 50 })!.score).toBe(100);
    expect(computeIcpFit({ employeeCount: 3 }, { companySizeMax: 500 })!.score).toBe(100);
  });

  it("never returns a score outside 0-100", () => {
    const band = { companySizeMin: 50, companySizeMax: 500 };
    for (const employeeCount of [1, 24, 25, 26, 49, 50, 499, 501, 999, 1000, 1001, 999999]) {
      const score = computeIcpFit({ employeeCount }, band)!.score;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  // ── Geography matching ─────────────────────────────────────────────────────

  it("averages country and region when the ICP constrains both", () => {
    const icp: IcpFitCriteria = { geographies: ["United States"], regions: ["California"] };
    const both = computeIcpFit({ country: "United States", city: "California" }, icp)!.score;
    const countryOnly = computeIcpFit({ country: "United States", city: "Berlin" }, icp)!.score;
    expect(both).toBe(100);
    expect(countryOnly).toBe(50);
  });

  it("finds a region in the free-text headquarters field", () => {
    const result = computeIcpFit(
      { headquarters: "Austin, Texas, United States" },
      { regions: ["Texas"] }
    );
    expect(result!.score).toBe(100);
  });

  // ── Weighting ──────────────────────────────────────────────────────────────

  it("weights industry above size and geography", () => {
    const industryOnly = computeIcpFit(
      { industry: "SaaS", employeeCount: 5, country: "Japan" },
      ICP
    )!.score;
    const industryMissed = computeIcpFit(
      { industry: "Mining", employeeCount: 200, country: "United States" },
      ICP
    )!.score;
    // 40% from industry beats either 30% dimension, but loses to both together.
    expect(industryOnly).toBe(40);
    expect(industryMissed).toBe(60);
  });
});

describe("resolveHeadcount", () => {
  it("prefers an exact employeeCount", () => {
    expect(resolveHeadcount({ employeeCount: 137, employeeRange: "1-10" })).toBe(137);
  });

  it("takes the midpoint of a bounded range", () => {
    expect(resolveHeadcount({ employeeRange: "51-200" })).toBe(126);
    expect(resolveHeadcount({ employeeRange: "1-10" })).toBe(6);
    expect(resolveHeadcount({ employeeRange: "201-500" })).toBe(351);
  });

  it("takes the lower bound of an open-ended range", () => {
    expect(resolveHeadcount({ employeeRange: "1000+" })).toBe(1000);
    expect(resolveHeadcount({ employeeRange: "10,000+" })).toBe(10000);
  });

  it("tolerates spacing and dash variants written by enrichment", () => {
    expect(resolveHeadcount({ employeeRange: " 51 - 200 " })).toBe(126);
    expect(resolveHeadcount({ employeeRange: "51–200" })).toBe(126);
  });

  it("returns null rather than guessing on unusable input", () => {
    expect(resolveHeadcount({})).toBeNull();
    expect(resolveHeadcount({ employeeRange: "" })).toBeNull();
    expect(resolveHeadcount({ employeeRange: "lots" })).toBeNull();
    expect(resolveHeadcount({ employeeCount: 0 })).toBeNull();
    expect(resolveHeadcount({ employeeCount: -5 })).toBeNull();
  });
});
