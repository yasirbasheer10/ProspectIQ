/**
 * Tests: Lookalike Search (`lib/ai/lookalike.ts` and `app/(app)/lookalike/icp-params.ts`)
 *
 * The whole feature rests on one claim made to the agency: *this profile came
 * from your customers*. `computeSharedProfile` is where that claim is either true
 * or quietly false, and the failure mode is silent — a profile assembled from the
 * wrong rows still reads fluently, still searches successfully, and just returns
 * companies with nothing to do with the agency's actual customers. So the bulk of
 * what follows pins down the counting rules rather than the output shape.
 *
 * The other half is the Json boundary. `AgentRun.outputData` is `Json?`, which
 * TypeScript sees as `any`, so nothing but `parseStoredLookalikeProfile` and these
 * tests stop the write path and the read path from drifting apart. Hence a real
 * round trip: a profile is built exactly as `runLookalikeEngine` builds it and has
 * to survive the reader.
 *
 * Everything external is mocked — Postgres, Groq, the scraper — so no test here
 * touches a database or spends a credit. The functions under test are all pure;
 * the mocks exist only so importing the module cannot open a connection.
 */

import {
  computeSharedProfile,
  parseEmployeeRange,
  countryFromHeadquarters,
  tidyNarrative,
  parseStoredLookalikeProfile,
  MIN_SEED_DOMAINS,
  MAX_SEED_DOMAINS,
  MONTHLY_LOOKALIKE_LIMIT,
  type LookalikeSeedRow,
  type StoredLookalikeProfile,
} from "@/lib/ai/lookalike";
import { sizeBucketFor } from "@/app/(app)/lookalike/icp-params";
import { SIZE_BUCKETS } from "@/app/(app)/discovery/constants";

jest.mock("@/lib/db", () => ({
  prisma: {
    company: { findMany: jest.fn() },
    agentRun: { update: jest.fn() },
    activity: { create: jest.fn() },
  },
}));

jest.mock("@/lib/activity", () => ({ logActivity: jest.fn() }));

jest.mock("@/lib/ai/groq", () => ({
  ai: { chat: { completions: { create: jest.fn() } } },
  MODEL: "test-model",
}));

// Not reached by anything under test; mocked so importing the module cannot
// start a scrape of a real website.
jest.mock("@/lib/ai/discovery", () => ({ ingestDomain: jest.fn() }));

// ─── Fixtures ──────────────────────────────────────────────────

/**
 * One seed company.
 *
 * Field names match `LookalikeSeedRow`, which in turn matches the `select` in
 * `runLookalikeEngine` — `technologies` and `headquarters`, not `techStack` and
 * `location`. A fixture that drifts from the real shape is worse than no fixture:
 * these objects are plain literals behind a typed parameter, so a wrong field name
 * would make the test pass or fail for reasons unrelated to the code.
 */
function seed(overrides: Partial<LookalikeSeedRow> = {}): LookalikeSeedRow {
  return {
    name: "Acme Co",
    domain: "acme.com",
    description: "Project tooling for agencies.",
    industry: "SaaS",
    businessModel: "B2B SaaS",
    employeeCount: null,
    employeeRange: null,
    technologies: [],
    headquarters: null,
    foundedYear: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// COUNT SEEDS, NOT OCCURRENCES
// ─────────────────────────────────────────────────────────────

describe("computeSharedProfile — the counting rule", () => {
  it("keeps a technology two of three companies use", () => {
    const profile = computeSharedProfile([
      seed({ technologies: ["HubSpot", "Webflow"] }),
      seed({ technologies: ["HubSpot", "Shopify"] }),
      seed({ technologies: ["Wordpress"] }),
    ]);

    expect(profile.technologies).toEqual(["HubSpot"]);
    expect(profile.shared.technology).toBe(true);
  });

  it("does not treat one company listing the same tool twice as agreement", () => {
    // The whole reason `tallyBySeed` exists. Counting occurrences would score
    // HubSpot at 2 here and report a shared stack that does not exist.
    const profile = computeSharedProfile([
      seed({ technologies: ["HubSpot", "hubspot", "HUBSPOT"] }),
      seed({ technologies: ["Webflow"] }),
    ]);

    expect(profile.technologies).toEqual([]);
    expect(profile.shared.technology).toBe(false);
  });

  it("matches values case-insensitively but reports the first spelling seen", () => {
    const profile = computeSharedProfile([
      seed({ technologies: ["HubSpot"] }),
      seed({ technologies: ["hubspot"] }),
    ]);

    expect(profile.technologies).toEqual(["HubSpot"]);
  });

  it("orders by how many companies agree, then alphabetically", () => {
    // Determinism matters beyond tidiness: two runs over the same customers must
    // not produce differently-ordered profiles, or the agency cannot tell whether
    // anything actually changed.
    const profile = computeSharedProfile([
      seed({ technologies: ["Zendesk", "Shopify", "Airtable"] }),
      seed({ technologies: ["Zendesk", "Shopify"] }),
      seed({ technologies: ["Zendesk", "Airtable"] }),
    ]);

    expect(profile.technologies).toEqual(["Zendesk", "Airtable", "Shopify"]);
  });

  it("ignores blank and whitespace-only values", () => {
    const profile = computeSharedProfile([
      seed({ technologies: ["", "   ", "Stripe"] }),
      seed({ technologies: ["Stripe", ""] }),
    ]);

    expect(profile.technologies).toEqual(["Stripe"]);
  });
});

// ─────────────────────────────────────────────────────────────
// INDUSTRY FALLS BACK, TECHNOLOGY DOES NOT
// ─────────────────────────────────────────────────────────────

describe("computeSharedProfile — industry vs technology", () => {
  it("keeps only the industries at least two companies share", () => {
    const profile = computeSharedProfile([
      seed({ industry: "E-commerce" }),
      seed({ industry: "E-commerce" }),
      seed({ industry: "Logistics" }),
    ]);

    expect(profile.industries).toEqual(["E-commerce"]);
    expect(profile.shared.industry).toBe(true);
  });

  it("falls back to every industry present when none are shared", () => {
    // An empty industry list would make the resulting discovery search
    // meaningless, so the fallback is deliberate. `shared.industry` stays false
    // so the confidence line still tells the truth about it.
    const profile = computeSharedProfile([
      seed({ industry: "Fintech" }),
      seed({ industry: "Healthcare" }),
    ]);

    expect(profile.industries.sort()).toEqual(["Fintech", "Healthcare"]);
    expect(profile.shared.industry).toBe(false);
  });

  it("does not fall back for technology", () => {
    // The opposite choice, for a specific reason: a tool exactly one company uses
    // says nothing about the pattern, and the discovery engine does not search on
    // technology anyway, so an empty list costs nothing.
    const profile = computeSharedProfile([
      seed({ technologies: ["Segment"] }),
      seed({ technologies: ["Amplitude"] }),
    ]);

    expect(profile.technologies).toEqual([]);
  });

  it("caps industries at six", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G", "H"].map((i) => seed({ industry: i }));
    expect(computeSharedProfile(rows).industries).toHaveLength(6);
  });

  it("survives companies with no industry at all", () => {
    // `ingestDomain` writes null here whenever the model could not tell.
    const profile = computeSharedProfile([seed({ industry: null }), seed({ industry: null })]);

    expect(profile.industries).toEqual([]);
    expect(profile.shared.industry).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// SIZE
// ─────────────────────────────────────────────────────────────

describe("computeSharedProfile — the employee band", () => {
  it("reports the band the seed companies actually occupy", () => {
    // Not widened. The bucket this maps onto is itself a wide window, so widening
    // the band first double-counts — see the size section of computeSharedProfile.
    const profile = computeSharedProfile([
      seed({ employeeCount: 40 }),
      seed({ employeeCount: 55 }),
      seed({ employeeCount: 60 }),
    ]);

    expect(profile.companySizeMin).toBe(40);
    expect(profile.companySizeMax).toBe(60);
    expect(profile.shared.size).toBe(true);
  });

  it("keeps a one-person company at one", () => {
    const profile = computeSharedProfile([seed({ employeeCount: 1 }), seed({ employeeCount: 3 })]);
    expect(profile.companySizeMin).toBe(1);
    expect(profile.companySizeMax).toBe(3);
  });

  it("lets one open-ended company open the whole band", () => {
    // Inventing a ceiling for "1000+" would be a number nobody observed.
    const profile = computeSharedProfile([
      seed({ employeeRange: "51-200" }),
      seed({ employeeRange: "1000+" }),
    ]);

    expect(profile.companySizeMin).toBe(51);
    expect(profile.companySizeMax).toBeNull();
  });

  it("prefers a real headcount over a range string", () => {
    const profile = computeSharedProfile([
      seed({ employeeCount: 30, employeeRange: "500-1000" }),
      seed({ employeeCount: 45, employeeRange: "Unknown" }),
    ]);

    expect(profile.companySizeMin).toBe(30);
    expect(profile.companySizeMax).toBe(45);
  });

  it("does not let an unknown size widen the band", () => {
    // The common case in production: `ingestDomain` writes the literal "Unknown"
    // whenever a homepage does not say. A company that reads must not turn the
    // band into one covering everybody.
    const profile = computeSharedProfile([
      seed({ employeeRange: "11-50" }),
      seed({ employeeRange: "Unknown" }),
      seed({ employeeRange: null }),
    ]);

    expect(profile.companySizeMin).toBe(11);
    expect(profile.companySizeMax).toBe(50);
    // Only one company contributed a size, so size did not agree on anything.
    expect(profile.shared.size).toBe(false);
  });

  it("reports no band when nobody's size is known", () => {
    const profile = computeSharedProfile([
      seed({ employeeRange: "Unknown" }),
      seed({ employeeRange: null, employeeCount: null }),
    ]);

    expect(profile.companySizeMin).toBeNull();
    expect(profile.companySizeMax).toBeNull();
    expect(profile.shared.size).toBe(false);
  });

  it("ignores a zero or negative headcount", () => {
    const profile = computeSharedProfile([seed({ employeeCount: 0 }), seed({ employeeCount: -5 })]);
    expect(profile.companySizeMin).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// CONFIDENCE
// ─────────────────────────────────────────────────────────────

describe("computeSharedProfile — confidence", () => {
  it("needs three companies as well as two agreements to say HIGH", () => {
    const strong = computeSharedProfile([
      seed({ industry: "SaaS", employeeCount: 40, technologies: ["HubSpot"] }),
      seed({ industry: "SaaS", employeeCount: 50, technologies: ["HubSpot"] }),
      seed({ industry: "SaaS", employeeCount: 60, technologies: ["HubSpot"] }),
    ]);

    expect(strong.confidence).toBe("HIGH");
  });

  it("caps two companies at MEDIUM however much they agree", () => {
    // With only two companies "both are in software" is a coincidence as easily
    // as a pattern, so the label must not overstate it.
    const twoIdentical = computeSharedProfile([
      seed({ industry: "SaaS", employeeCount: 40, technologies: ["HubSpot"] }),
      seed({ industry: "SaaS", employeeCount: 50, technologies: ["HubSpot"] }),
    ]);

    expect(twoIdentical.shared).toEqual({ industry: true, size: true, technology: true });
    expect(twoIdentical.confidence).toBe("MEDIUM");
  });

  it("says LOW when nothing agreed", () => {
    const profile = computeSharedProfile([
      seed({ industry: "Fintech", employeeRange: "Unknown", technologies: [] }),
      seed({ industry: "Logistics", employeeRange: null, technologies: [] }),
    ]);

    expect(profile.confidence).toBe("LOW");
    expect(profile.shared).toEqual({ industry: false, size: false, technology: false });
  });

  it("names what agreed and what did not, so the agency can judge the profile", () => {
    const profile = computeSharedProfile([
      seed({ industry: "SaaS", employeeRange: "Unknown", technologies: [] }),
      seed({ industry: "SaaS", employeeRange: "Unknown", technologies: [] }),
      seed({ industry: "SaaS", employeeRange: "Unknown", technologies: [] }),
    ]);

    expect(profile.confidenceReason).toContain("industry");
    expect(profile.confidenceReason).toContain("company size");
    expect(profile.confidenceReason).toContain("technology");
  });

  it("tells the agency to edit the profile when nothing agreed", () => {
    const profile = computeSharedProfile([
      seed({ industry: "Fintech" }),
      seed({ industry: "Logistics" }),
    ]);

    expect(profile.confidenceReason).toMatch(/edit/i);
  });

  it("records how many companies it read", () => {
    expect(computeSharedProfile([seed(), seed(), seed()]).seedCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// GEOGRAPHY
// ─────────────────────────────────────────────────────────────

describe("countryFromHeadquarters", () => {
  it("takes the last comma-separated piece", () => {
    expect(countryFromHeadquarters("Berlin, Germany")).toBe("Germany");
    expect(countryFromHeadquarters("Toronto, Ontario, Canada")).toBe("Canada");
  });

  it("expands the two-letter cases worth naming", () => {
    expect(countryFromHeadquarters("London, UK")).toBe("United Kingdom");
    expect(countryFromHeadquarters("London, gb")).toBe("United Kingdom");
    expect(countryFromHeadquarters("Austin, USA")).toBe("United States");
    expect(countryFromHeadquarters("Austin, US")).toBe("United States");
  });

  it("reads any other bare two-letter token as a US state", () => {
    // A bare "TX" sent to a search engine as a country returns nothing at all,
    // which is a worse answer than guessing the country it is almost always in.
    expect(countryFromHeadquarters("Austin, TX")).toBe("United States");
    expect(countryFromHeadquarters("San Francisco, CA")).toBe("United States");
  });

  it("returns a single unlabelled city unchanged rather than inventing a country", () => {
    expect(countryFromHeadquarters("Singapore")).toBe("Singapore");
  });

  it("handles missing and empty values", () => {
    expect(countryFromHeadquarters(null)).toBeNull();
    expect(countryFromHeadquarters(undefined)).toBeNull();
    expect(countryFromHeadquarters("")).toBeNull();
    expect(countryFromHeadquarters(" , , ")).toBeNull();
  });

  it("feeds computeSharedProfile a deduplicated country list", () => {
    const profile = computeSharedProfile([
      seed({ headquarters: "Austin, TX" }),
      seed({ headquarters: "Denver, CO" }),
      seed({ headquarters: "London, UK" }),
    ]);

    expect(profile.geographies).toEqual(["United States", "United Kingdom"]);
  });
});

// ─────────────────────────────────────────────────────────────
// EMPLOYEE RANGE STRINGS
// ─────────────────────────────────────────────────────────────

describe("parseEmployeeRange", () => {
  it("reads the clean buckets the discovery form writes", () => {
    expect(parseEmployeeRange("51-200")).toEqual({ min: 51, max: 200 });
    expect(parseEmployeeRange("1-10")).toEqual({ min: 1, max: 10 });
  });

  it("reads the shapes a model writes from a homepage", () => {
    expect(parseEmployeeRange("51 – 200")).toEqual({ min: 51, max: 200 });
    expect(parseEmployeeRange("51 to 200")).toEqual({ min: 51, max: 200 });
    expect(parseEmployeeRange("1,000-5,000")).toEqual({ min: 1000, max: 5000 });
    expect(parseEmployeeRange("about 200 employees")).toEqual({ min: 200, max: 200 });
  });

  it("treats a trailing plus as no upper bound", () => {
    expect(parseEmployeeRange("1000+")).toEqual({ min: 1000, max: null });
    expect(parseEmployeeRange("500 plus")).toEqual({ min: 500, max: null });
  });

  it("tolerates a reversed range rather than discarding a real answer", () => {
    expect(parseEmployeeRange("200-51")).toEqual({ min: 51, max: 200 });
  });

  it("returns null for the values that mean nothing is known", () => {
    expect(parseEmployeeRange("Unknown")).toBeNull();
    expect(parseEmployeeRange("")).toBeNull();
    expect(parseEmployeeRange("   ")).toBeNull();
    expect(parseEmployeeRange(null)).toBeNull();
    expect(parseEmployeeRange(undefined)).toBeNull();
    expect(parseEmployeeRange("a handful of people")).toBeNull();
    expect(parseEmployeeRange("0")).toBeNull();
  });

  it("parses every bucket the discovery form can produce", () => {
    // The contract `sizeBucketFor` depends on: if any bucket stopped parsing, the
    // dropdown would silently lose an option.
    for (const bucket of SIZE_BUCKETS) {
      expect(parseEmployeeRange(bucket)).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// BAND → DROPDOWN BUCKET
// ─────────────────────────────────────────────────────────────

describe("sizeBucketFor", () => {
  it("picks the bucket that covers most of the band", () => {
    expect(sizeBucketFor(55, 70)).toBe("51-200");
    expect(sizeBucketFor(300, 320)).toBe("201-500");
  });

  it("does not simply pick the widest bucket", () => {
    // "1-10" is the narrowest option, and a small cohort has to be able to reach it.
    expect(sizeBucketFor(8, 12)).toBe("1-10");
    expect(sizeBucketFor(3, 9)).toBe("1-10");
  });

  it("matches an exact bucket to itself", () => {
    expect(sizeBucketFor(51, 200)).toBe("51-200");
    expect(sizeBucketFor(1, 10)).toBe("1-10");
  });

  it("sends an open-ended band to the open-ended bucket", () => {
    expect(sizeBucketFor(1500, null)).toBe("1000+");
  });

  it("does not promote a mid-size cohort into the open-ended bucket", () => {
    // The regression the old widened band caused: two customers of 600 and 800
    // people came out as "1000+", so the search went looking for enterprises.
    expect(sizeBucketFor(600, 800)).toBe("501-1000");
    expect(sizeBucketFor(45, 48)).toBe("11-50");
  });

  it("returns null when there is no band to convert", () => {
    // Better to search every size than to assert one nobody observed.
    expect(sizeBucketFor(null, null)).toBeNull();
    expect(sizeBucketFor(0, 50)).toBeNull();
  });

  it("always returns a real bucket or null, never an invented string", () => {
    // `saveProfileAsIcp` validates the size against SIZE_BUCKETS and rejects
    // anything else, so a bucket from here that is not on the list would make the
    // save button fail on a value the app itself chose.
    for (const [min, max] of [
      [1, 5],
      [8, 12],
      [30, 300],
      [400, 900],
      [900, 1100],
      [5000, null],
    ] as [number, number | null][]) {
      const bucket = sizeBucketFor(min, max);
      expect(bucket === null || SIZE_BUCKETS.includes(bucket)).toBe(true);
    }
  });

  it("lines up with what computeSharedProfile produces", () => {
    // The two halves in sequence, which is how the page actually uses them.
    const profile = computeSharedProfile([
      seed({ employeeCount: 60 }),
      seed({ employeeCount: 80 }),
      seed({ employeeCount: 95 }),
    ]);

    expect(sizeBucketFor(profile.companySizeMin, profile.companySizeMax)).toBe("51-200");
  });

  it("puts the bucket where most of the seed companies actually are", () => {
    // The property that matters, stated directly: whichever bucket comes back
    // should contain more of these companies than any other one does.
    const cohorts: number[][] = [
      [3, 5, 9],
      [15, 22, 40],
      [45, 48],
      [55, 60, 70],
      [95, 140, 160],
      [300, 320],
      [600, 800],
      [1500, 3000],
    ];

    for (const counts of cohorts) {
      const profile = computeSharedProfile(counts.map((n) => seed({ employeeCount: n })));
      const bucket = sizeBucketFor(profile.companySizeMin, profile.companySizeMax);
      expect(bucket).not.toBeNull();

      const bounds = parseEmployeeRange(bucket as string);
      const inside = counts.filter(
        (c) => c >= (bounds as { min: number }).min && c <= ((bounds as { max: number | null }).max ?? Infinity)
      ).length;

      expect(inside).toBeGreaterThanOrEqual(Math.ceil(counts.length / 2));
    }
  });
});

// ─────────────────────────────────────────────────────────────
// THE MODEL'S HALF
// ─────────────────────────────────────────────────────────────

describe("tidyNarrative", () => {
  const base = { name: "Mid-market DTC brands", description: "They all sell direct.", keywords: [] as string[], sharedTraits: [] as string[] };

  it("strips the characters that break the query builder", () => {
    const out = tidyNarrative({
      ...base,
      keywords: ['"skincare brand"', "shopify OR bigcommerce", "(subscription box)"],
    });

    for (const k of out.keywords) {
      expect(k).not.toMatch(/["'()]/);
      expect(k).not.toMatch(/\b(AND|OR|NOT)\b/);
    }
  });

  it("keeps a keyword that only needed cleaning, rather than dropping it", () => {
    const out = tidyNarrative({ ...base, keywords: ['"skincare brand"'] });
    expect(out.keywords).toEqual(["skincare brand"]);
  });

  it("holds keywords to the length the search builder slices them to", () => {
    const out = tidyNarrative({
      ...base,
      keywords: ["a very long search phrase that nobody would ever type into a search box"],
    });

    expect(out.keywords[0].length).toBeLessThanOrEqual(25);
  });

  it("caps keywords at four, because each one becomes three web queries", () => {
    const out = tidyNarrative({
      ...base,
      keywords: ["one", "two", "three", "four", "five", "six"],
    });

    expect(out.keywords).toEqual(["one", "two", "three", "four"]);
  });

  it("dedupes keywords case-insensitively", () => {
    const out = tidyNarrative({ ...base, keywords: ["Skincare", "skincare", "SKINCARE"] });
    expect(out.keywords).toEqual(["Skincare"]);
  });

  it("drops keywords that were nothing but punctuation", () => {
    const out = tidyNarrative({ ...base, keywords: ['"""', "()", "  ", "real one"] });
    expect(out.keywords).toEqual(["real one"]);
  });

  it("caps the name, the description and the traits", () => {
    const out = tidyNarrative({
      name: "n".repeat(200),
      description: "d".repeat(2000),
      keywords: [],
      sharedTraits: Array.from({ length: 12 }, (_, i) => `trait ${i}`),
    });

    expect(out.name).toHaveLength(80);
    expect(out.description).toHaveLength(900);
    expect(out.sharedTraits).toHaveLength(6);
  });

  it("drops blank traits", () => {
    const out = tidyNarrative({ ...base, sharedTraits: ["real", "   ", ""] });
    expect(out.sharedTraits).toEqual(["real"]);
  });
});

// ─────────────────────────────────────────────────────────────
// THE JSON BOUNDARY
// ─────────────────────────────────────────────────────────────

describe("parseStoredLookalikeProfile", () => {
  /** Assembled exactly as `runLookalikeEngine` assembles it before the write. */
  function stored(): StoredLookalikeProfile {
    const profile = computeSharedProfile([
      seed({ name: "Acme Co", domain: "acme.com", industry: "E-commerce", employeeCount: 40, technologies: ["Shopify"], headquarters: "Austin, TX" }),
      seed({ name: "Northwind", domain: "northwind.co.uk", industry: "E-commerce", employeeCount: 60, technologies: ["Shopify"], headquarters: "London, UK" }),
      seed({ name: "Brightpath", domain: "brightpath.io", industry: "E-commerce", employeeCount: 55, technologies: ["Shopify"], headquarters: "Denver, CO" }),
    ]);

    const narrative = tidyNarrative({
      name: "Mid-market DTC brands on Shopify",
      description: "Three consumer brands selling direct, all on Shopify, all around fifty people.",
      keywords: ["DTC skincare brand", "shopify plus store"],
      sharedTraits: ["All sell direct to consumers", "All run on Shopify"],
    });

    return {
      ...profile,
      ...narrative,
      seeds: [
        { domain: "acme.com", name: "Acme Co", companyId: "co-1", skippedReason: null },
        { domain: "northwind.co.uk", name: "Northwind", companyId: "co-2", skippedReason: null },
        { domain: "brightpath.io", name: "Brightpath", companyId: "co-3", skippedReason: null },
      ],
    };
  }

  it("survives a real round trip through JSON", () => {
    // The centrepiece. `outputData` is a `Json?` column, so TypeScript believes it
    // is `any` in both directions — if the writer and the reader ever disagree,
    // runs go green and every profile written since renders as "no profile yet".
    const written = JSON.parse(JSON.stringify(stored()));
    const read = parseStoredLookalikeProfile(written);

    expect(read).not.toBeNull();
    expect(read).toEqual(stored());
  });

  it("preserves the fields the screen actually renders", () => {
    const read = parseStoredLookalikeProfile(JSON.parse(JSON.stringify(stored())));

    expect(read?.name).toBe("Mid-market DTC brands on Shopify");
    expect(read?.industries).toEqual(["E-commerce"]);
    expect(read?.technologies).toEqual(["Shopify"]);
    expect(read?.geographies).toEqual(["United States", "United Kingdom"]);
    expect(read?.confidence).toBe("HIGH");
    expect(read?.seeds).toHaveLength(3);
    expect(read?.keywords.length).toBeGreaterThan(0);
  });

  it("treats missing lists as empty rather than failing", () => {
    const partial = {
      name: "A profile",
      description: "Something.",
      seedCount: 2,
      shared: { industry: true, size: false, technology: false },
      confidence: "MEDIUM",
      confidenceReason: "Industry agreed.",
    };

    const read = parseStoredLookalikeProfile(partial);

    expect(read).not.toBeNull();
    expect(read?.industries).toEqual([]);
    expect(read?.keywords).toEqual([]);
    expect(read?.seeds).toEqual([]);
    expect(read?.companySizeMin).toBeNull();
  });

  it("rejects an unrecognised confidence instead of defaulting it", () => {
    // The one value deliberately not coerced. A confidence label is a claim about
    // how much to trust everything else in the object, so quietly turning a
    // corrupt one into MEDIUM is the coercion that could actively mislead — and a
    // profile is cheap to rebuild, because nothing has been sent to anybody.
    const corrupt = { ...JSON.parse(JSON.stringify(stored())), confidence: "VERY_HIGH" };
    expect(parseStoredLookalikeProfile(corrupt)).toBeNull();
  });

  it("rejects a profile with no name or description", () => {
    const noName = { ...JSON.parse(JSON.stringify(stored())), name: "" };
    expect(parseStoredLookalikeProfile(noName)).toBeNull();

    const noDescription = { ...JSON.parse(JSON.stringify(stored())), description: "" };
    expect(parseStoredLookalikeProfile(noDescription)).toBeNull();
  });

  it("returns null for junk rather than throwing", () => {
    // The page renders the paste box when this is null, so returning null is the
    // recoverable answer and throwing would be a 500 on a working feature.
    expect(parseStoredLookalikeProfile(null)).toBeNull();
    expect(parseStoredLookalikeProfile(undefined)).toBeNull();
    expect(parseStoredLookalikeProfile("not an object")).toBeNull();
    expect(parseStoredLookalikeProfile(42)).toBeNull();
    expect(parseStoredLookalikeProfile([])).toBeNull();
    expect(parseStoredLookalikeProfile({})).toBeNull();
  });

  it("keeps the reason a seed was skipped", () => {
    // Shown to the agency verbatim: "we could not read two of the five sites you
    // pasted" is the difference between a thin profile and a broken feature.
    const withSkip = {
      ...JSON.parse(JSON.stringify(stored())),
      seeds: [
        { domain: "acme.com", name: "Acme Co", companyId: "co-1", skippedReason: null },
        { domain: "blocked.com", name: null, companyId: null, skippedReason: "The site blocked us." },
      ],
    };

    const read = parseStoredLookalikeProfile(withSkip);
    expect(read?.seeds[1].skippedReason).toBe("The site blocked us.");
    expect(read?.seeds[1].companyId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// THE LIMITS THE UI PROMISES
// ─────────────────────────────────────────────────────────────

describe("limits", () => {
  it("keeps the seed bounds sane and in the order the copy claims", () => {
    // The screen tells the agency "two to five customers"; these are the numbers
    // behind that sentence.
    expect(MIN_SEED_DOMAINS).toBeGreaterThanOrEqual(2);
    expect(MAX_SEED_DOMAINS).toBeGreaterThan(MIN_SEED_DOMAINS);
  });

  it("has a monthly limit worth enforcing", () => {
    expect(MONTHLY_LOOKALIKE_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(MONTHLY_LOOKALIKE_LIMIT)).toBe(true);
  });

  it("computes a profile from the minimum number of seeds the action allows", () => {
    const rows = Array.from({ length: MIN_SEED_DOMAINS }, () => seed({ industry: "SaaS" }));
    const profile = computeSharedProfile(rows);

    expect(profile.seedCount).toBe(MIN_SEED_DOMAINS);
    expect(profile.industries).toEqual(["SaaS"]);
  });

  it("computes a profile from the maximum number of seeds the action allows", () => {
    const rows = Array.from({ length: MAX_SEED_DOMAINS }, (_, i) =>
      seed({ industry: "SaaS", employeeCount: 30 + i * 10, technologies: ["Shopify"] })
    );
    const profile = computeSharedProfile(rows);

    expect(profile.seedCount).toBe(MAX_SEED_DOMAINS);
    expect(profile.confidence).toBe("HIGH");
  });
});
