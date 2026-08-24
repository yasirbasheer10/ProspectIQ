/**
 * Deterministic firmographic ICP fit.
 *
 * Every sub-score in `OpportunityScore` used to come from the model. With
 * `temperature: 0.2` and no seed, the same company scored twice could land in
 * different grade bands — which is indefensible for a ranked list the user reads
 * as objective. Firmographic fit needs no model at all: industry, headcount and
 * geography are facts already on the `Company` row, and the ICP the user
 * configured says exactly what they should be. So this computes it in code.
 *
 * Three rules the design follows, in order of importance:
 *
 *  1. **Missing data is not a mismatch.** A company with no `industry` recorded
 *     is unknown, not wrong. Unknown dimensions are dropped and the remaining
 *     weights re-normalise, rather than scoring 0 and dragging the company down
 *     for a gap in *our* data.
 *  2. **Unconstrained dimensions are dropped too.** An ICP that names no
 *     geography is not failed by a company in Latvia.
 *  3. **Nothing to compare returns `null`, not a number.** No active ICP, an ICP
 *     that constrains nothing, or a company with no firmographics at all, and
 *     this returns `null` so the caller can say so instead of inventing a 50.
 *
 * Pure and synchronous: same inputs, same output, no I/O.
 */

export interface IcpFitCompany {
  industry?: string | null;
  subIndustry?: string | null;
  employeeCount?: number | null;
  employeeRange?: string | null;
  country?: string | null;
  city?: string | null;
  headquarters?: string | null;
}

/** The subset of the `ICP` model that describes firmographics. */
export interface IcpFitCriteria {
  industries?: string[] | null;
  excludedIndustries?: string[] | null;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  geographies?: string[] | null;
  regions?: string[] | null;
}

export interface IcpFitDimension {
  name: "industry" | "size" | "geography";
  /** 0-100 for this dimension alone. */
  score: number;
  /** Share of the final score this dimension carried, after re-normalisation. */
  weight: number;
  /** Human-readable justification, surfaced in logs and tests. */
  note: string;
}

export interface IcpFitResult {
  /** 0-100 weighted across whichever dimensions could be judged. */
  score: number;
  /** True when the company's industry is on the ICP's exclusion list. */
  excluded: boolean;
  dimensions: IcpFitDimension[];
  /** One line per dimension, plus the exclusion line if it fired. */
  reasons: string[];
}

/**
 * Relative importance before re-normalisation. Industry leads because it is the
 * coarsest filter — a wrong-industry company is rarely worth a call regardless
 * of how well its headcount lines up.
 */
const DIMENSION_WEIGHTS = {
  industry: 0.4,
  size: 0.3,
  geography: 0.3,
} as const;

/** How close an exact string match has to be before it counts as a partial one. */
const PARTIAL_MATCH_SCORE = 80;

/** Casing, punctuation and stray whitespace should not decide a match. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nonEmpty(list: string[] | null | undefined): string[] {
  return (list ?? []).map((v) => (v ?? "").trim()).filter((v) => v.length > 0);
}

/**
 * Does `candidate` match any of `targets`?
 *
 * Substring matching in either direction is deliberate: an ICP that says "SaaS"
 * should match a company recorded as "B2B SaaS", and an ICP that says
 * "Financial Services" should match "Finance". It is looser than exact equality
 * and scores lower to say so.
 */
function matchStrength(candidate: string, targets: string[]): number {
  const c = normalize(candidate);
  if (!c) return 0;

  for (const target of targets) {
    if (normalize(target) === c) return 100;
  }
  for (const target of targets) {
    const t = normalize(target);
    if (!t) continue;
    if (c.includes(t) || t.includes(c)) return PARTIAL_MATCH_SCORE;
  }
  return 0;
}

/**
 * Expand composite location strings into their parts, keeping the whole too.
 *
 * `Company.headquarters` is free text in the shape "City, State, Country", so
 * matching an ICP region against the whole string only ever produces a substring
 * hit. Splitting on the separators people actually use means the region can match
 * a part exactly.
 */
function splitLocality(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const whole = (raw ?? "").trim();
    if (!whole) continue;
    out.push(whole);
    if (/[,/|]/.test(whole)) {
      for (const part of whole.split(/[,/|]/)) {
        const trimmed = part.trim();
        if (trimmed) out.push(trimmed);
      }
    }
  }
  return Array.from(new Set(out));
}

/**
 * A single headcount to compare against the ICP's band.
 *
 * `employeeCount` wins when present. Otherwise `employeeRange` — the string the
 * discovery form and enrichment write, e.g. `"51-200"` or `"1000+"` — is reduced
 * to its midpoint, or to its lower bound for an open-ended top band.
 */
export function resolveHeadcount(company: IcpFitCompany): number | null {
  if (typeof company.employeeCount === "number" && company.employeeCount > 0) {
    return company.employeeCount;
  }

  const range = (company.employeeRange ?? "").trim();
  if (!range) return null;

  const openEnded = /^(\d[\d,]*)\s*\+$/.exec(range);
  if (openEnded) {
    const lower = Number.parseInt(openEnded[1].replace(/,/g, ""), 10);
    return Number.isFinite(lower) && lower > 0 ? lower : null;
  }

  const bounded = /^(\d[\d,]*)\s*[-–—to]+\s*(\d[\d,]*)$/i.exec(range);
  if (bounded) {
    const lo = Number.parseInt(bounded[1].replace(/,/g, ""), 10);
    const hi = Number.parseInt(bounded[2].replace(/,/g, ""), 10);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo) {
      return Math.round((lo + hi) / 2);
    }
  }

  const single = /^(\d[\d,]*)$/.exec(range);
  if (single) {
    const n = Number.parseInt(single[1].replace(/,/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

/**
 * Score a headcount against the ICP band, with a linear decay outside it rather
 * than a cliff. A 45-person company against a 50–500 ICP is a near-miss worth
 * ranking above a 5-person one; a hard 0 for both would lose that. Decay reaches
 * 0 at half the minimum and at twice the maximum.
 */
function scoreHeadcount(headcount: number, min: number | null, max: number | null): number {
  const aboveMin = min === null || headcount >= min;
  const belowMax = max === null || headcount <= max;
  if (aboveMin && belowMax) return 100;

  if (!aboveMin && min !== null) {
    const floor = min / 2;
    if (headcount <= floor) return 0;
    return Math.round(100 * ((headcount - floor) / (min - floor)));
  }

  if (max !== null) {
    const ceiling = max * 2;
    if (headcount >= ceiling) return 0;
    return Math.round(100 * ((ceiling - headcount) / (ceiling - max)));
  }

  return 0;
}

function describeBand(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}-${max}`;
  if (min !== null) return `${min}+`;
  if (max !== null) return `up to ${max}`;
  return "any size";
}

/**
 * Compute firmographic fit, or `null` when there is nothing to compare.
 *
 * `null` is a real answer, not a failure: it means the caller should fall back to
 * whatever other signal it has rather than pretending to a deterministic number.
 */
export function computeIcpFit(
  company: IcpFitCompany,
  icp: IcpFitCriteria | null | undefined
): IcpFitResult | null {
  if (!icp) return null;

  const industries = nonEmpty(icp.industries);
  const excludedIndustries = nonEmpty(icp.excludedIndustries);
  const geographies = nonEmpty(icp.geographies);
  const regions = nonEmpty(icp.regions);
  const min = typeof icp.companySizeMin === "number" ? icp.companySizeMin : null;
  const max = typeof icp.companySizeMax === "number" ? icp.companySizeMax : null;

  // Exclusion is a veto, checked before anything else and against both the
  // industry and sub-industry — a company filed under "Technology / Defense"
  // should be caught by an ICP that excludes defense.
  const companyIndustries = [company.industry, company.subIndustry]
    .map((v) => (v ?? "").trim())
    .filter((v) => v.length > 0);

  if (excludedIndustries.length > 0) {
    for (const value of companyIndustries) {
      if (matchStrength(value, excludedIndustries) > 0) {
        return {
          score: 0,
          excluded: true,
          dimensions: [],
          reasons: [`Industry "${value}" is on the ICP's exclusion list.`],
        };
      }
    }
  }

  const dimensions: IcpFitDimension[] = [];

  // ── Industry ──────────────────────────────────────────────────────────────
  // Best of industry and sub-industry: a company recorded as
  // "Technology / E-commerce" should match an ICP targeting E-commerce.
  if (industries.length > 0 && companyIndustries.length > 0) {
    let best = 0;
    let bestValue = companyIndustries[0];
    for (const value of companyIndustries) {
      const strength = matchStrength(value, industries);
      if (strength > best) {
        best = strength;
        bestValue = value;
      }
    }
    dimensions.push({
      name: "industry",
      score: best,
      weight: DIMENSION_WEIGHTS.industry,
      note:
        best === 100
          ? `Industry "${bestValue}" is a target industry.`
          : best > 0
          ? `Industry "${bestValue}" partially matches a target industry.`
          : `Industry "${bestValue}" is not a target industry (targets: ${industries.join(", ")}).`,
    });
  }

  // ── Size ──────────────────────────────────────────────────────────────────
  const headcount = resolveHeadcount(company);
  if ((min !== null || max !== null) && headcount !== null) {
    const score = scoreHeadcount(headcount, min, max);
    dimensions.push({
      name: "size",
      score,
      weight: DIMENSION_WEIGHTS.size,
      note:
        score === 100
          ? `${headcount} employees is inside the target band (${describeBand(min, max)}).`
          : `${headcount} employees is outside the target band (${describeBand(min, max)}).`,
    });
  }

  // ── Geography ─────────────────────────────────────────────────────────────
  // Country and region are averaged over whichever of the two can be judged, so
  // an ICP that lists countries but no regions is scored on countries alone.
  const geoParts: { score: number; note: string }[] = [];

  if (geographies.length > 0 && (company.country ?? "").trim()) {
    const country = company.country!.trim();
    const score = matchStrength(country, geographies);
    geoParts.push({
      score,
      note:
        score > 0
          ? `Country "${country}" is a target geography.`
          : `Country "${country}" is outside the target geographies (${geographies.join(", ")}).`,
    });
  }

  if (regions.length > 0) {
    // `headquarters` is a free-text "City, State, Country" string, so it is
    // checked alongside `city` — a region may only appear in that field. Its
    // comma-separated parts are candidates in their own right, so "Texas" in
    // "Austin, Texas, United States" is an exact match on a part rather than a
    // fuzzy substring hit on the whole.
    const locality = splitLocality([company.city, company.headquarters]);
    if (locality.length > 0) {
      let best = 0;
      let bestValue = locality[0];
      for (const value of locality) {
        const strength = matchStrength(value, regions);
        if (strength > best) {
          best = strength;
          bestValue = value;
        }
      }
      geoParts.push({
        score: best,
        note:
          best > 0
            ? `Location "${bestValue}" is in a target region.`
            : `Location "${bestValue}" is outside the target regions (${regions.join(", ")}).`,
      });
    }
  }

  if (geoParts.length > 0) {
    const score = Math.round(
      geoParts.reduce((sum, part) => sum + part.score, 0) / geoParts.length
    );
    dimensions.push({
      name: "geography",
      score,
      weight: DIMENSION_WEIGHTS.geography,
      note: geoParts.map((p) => p.note).join(" "),
    });
  }

  // Nothing judgeable: either the ICP constrains none of these three, or the
  // company has no firmographics recorded. Say so rather than guess.
  if (dimensions.length === 0) return null;

  // Re-normalise over the dimensions that survived, so dropping one does not
  // silently cap the maximum achievable score.
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const normalized = dimensions.map((d) => ({ ...d, weight: d.weight / totalWeight }));
  const score = Math.round(
    normalized.reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  return {
    score,
    excluded: false,
    dimensions: normalized,
    reasons: normalized.map((d) => d.note),
  };
}
