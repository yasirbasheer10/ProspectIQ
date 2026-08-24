/**
 * Tests: Growth Audit content, write path and read path (`lib/ai/audit.ts`)
 *
 * Two halves of one boundary. `generateAuditContent` decides what goes into the
 * `sections` Json column; `parseStoredAuditContent` decides what can come back
 * out. Because that column is Json, nothing but these tests stops the two from
 * drifting — and the failure mode when they drift is the worst kind: audits
 * generate successfully, the run goes green, and the document renders as "this
 * audit can't be displayed" for every row written since the drift.
 *
 * So the centrepiece here is a genuine round trip: a realistic model response
 * goes through the real generator with the real schema, gets projected exactly
 * as `runGrowthAuditEngine` projects it, and has to survive the reader.
 *
 * Everything external is mocked — Postgres, Groq, Serper, the Jina reader — so
 * no test touches a database or spends a credit.
 */

import {
  generateAuditContent,
  parseStoredAuditContent,
  parseBrandSnapshot,
  safeBrandColor,
  safeLogoUrl,
  MONTHLY_AUDIT_LIMIT,
} from "@/lib/ai/audit";
import { prisma } from "@/lib/db";
import { ai } from "@/lib/ai/groq";

jest.mock("@/lib/db", () => ({
  prisma: {
    company: { findFirst: jest.fn() },
    offer: { findMany: jest.fn() },
    growthAudit: { update: jest.fn(), create: jest.fn(), count: jest.fn() },
    agentRun: { update: jest.fn(), create: jest.fn() },
    evidence: { count: jest.fn() },
    activity: { create: jest.fn() },
  },
}));

jest.mock("@/lib/activity", () => ({ logActivity: jest.fn() }));

jest.mock("@/lib/ai/groq", () => ({
  ai: { chat: { completions: { create: jest.fn() } } },
  MODEL: "test-model",
}));

jest.mock("@/lib/ai/search", () => ({ performSearch: jest.fn() }));

// Neither is reached by anything under test here; mocked so importing the module
// under test cannot start a scrape.
jest.mock("@/lib/ai/discovery", () => ({ ingestDomain: jest.fn() }));
jest.mock("@/lib/ai/intelligence", () => ({ researchCompany: jest.fn() }));

const mocked = (fn: unknown) => fn as jest.Mock;

const companyFindFirst = mocked(prisma.company.findFirst);
const offerFindMany = mocked(prisma.offer.findMany);
const modelCreate = mocked(ai.chat.completions.create);

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Fixtures ──────────────────────────────────────────────────

/**
 * Two real evidence rows, so citation grounding has something to ground on.
 *
 * Field names match `model Evidence` exactly — `summary` included even though
 * only the prompt reads it. A fixture that drifts from the schema is worse than
 * no fixture: `mockResolvedValue` takes `any`, so tsc cannot catch it and the
 * test passes or fails for reasons that have nothing to do with the code.
 */
const EVIDENCE = [
  {
    id: "ev-homepage",
    title: "Homepage",
    summary: "Hero copy and primary call to action.",
    quote: "We help teams do more.",
    sourceUrl: "https://acme.com",
    sourceName: "acme.com",
  },
  {
    id: "ev-pricing",
    title: "Pricing page",
    summary: "Three tiers, all gated behind a sales call.",
    quote: null,
    sourceUrl: "https://acme.com/pricing",
    sourceName: "acme.com",
  },
];

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "co-1",
    workspaceId: "ws-1",
    name: "Acme Co",
    domain: "acme.com",
    description: "Project tooling for agencies.",
    industry: "Software",
    businessModel: "B2B SaaS",
    employeeCount: 40,
    employeeRange: "25-50",
    foundedYear: 2019,
    headquarters: "Austin, TX",
    technologies: ["Webflow", "HubSpot"],
    evidence: EVIDENCE,
    signals: [],
    ...overrides,
  };
}

/** Field names match `model Offer`; `services` is the one the audit reads. */
function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "of-1",
    createdAt: new Date("2026-01-01"),
    name: "Growth retainer",
    description: "Growth for B2B software.",
    valueProposition: null,
    services: [] as string[],
    targetProblems: [] as string[],
    differentiators: [] as string[],
    isActive: true,
    ...overrides,
  };
}

/** A model response that satisfies `GrowthAuditSchema`. */
function modelResponse(overrides: Record<string, unknown> = {}) {
  return {
    headline: "Three things costing Acme pipeline",
    summary: "Your homepage is doing less work than it could.",
    findings: [
      {
        area: "POSITIONING",
        severity: "HIGH",
        effort: "QUICK_WIN",
        title: "The homepage does not say who this is for",
        observation: '"We help teams do more" could describe any software company.',
        impact: "Visitors who do not self-identify in five seconds leave.",
        recommendation: "Rewrite the hero around the specific buyer.",
        evidenceIds: ["ev-homepage"],
        matchedService: "Messaging & positioning",
      },
      {
        area: "CONVERSION",
        severity: "MEDIUM",
        effort: "PROJECT",
        title: "Pricing asks for a call before it shows a number",
        observation: "The pricing page has no figures on it.",
        impact: null,
        recommendation: "Publish a starting price.",
        evidenceIds: ["ev-pricing"],
        matchedService: "Conversion rate optimisation",
      },
    ],
    strengths: ["Clear case studies with named clients."],
    nextStep: "A one-week messaging sprint on the homepage.",
    ...overrides,
  };
}

function respondWith(payload: unknown) {
  modelCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

/** Exactly the projection `runGrowthAuditEngine` writes to `sections`. */
function asStored(content: Awaited<ReturnType<typeof generateAuditContent>>) {
  return {
    findings: content.findings,
    strengths: content.strengths,
    nextStep: content.nextStep,
    score: content.score,
    unmatchedFindingCount: content.unmatchedFindingCount,
  };
}

const params = { companyId: "co-1", workspaceId: "ws-1" };

// ─── The round trip ────────────────────────────────────────────

describe("generated content survives being stored and read back", () => {
  it("round-trips a realistic audit through the Json column", async () => {
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([
      offer({ services: ["Messaging & positioning", "Conversion rate optimisation"] }),
    ]);
    respondWith(modelResponse());

    const content = await generateAuditContent(params);

    // Serialise for real: `sections` goes through JSON on the way to Postgres,
    // so anything that does not survive `JSON.stringify` (a Date, undefined)
    // would be lost here and nowhere else.
    const stored = JSON.parse(JSON.stringify(asStored(content)));
    const read = parseStoredAuditContent(stored);

    expect(read).not.toBeNull();
    expect(read!.findings).toHaveLength(2);
    expect(read!.findings[0].title).toBe(content.findings[0].title);
    expect(read!.findings[0].citations[0].sourceUrl).toBe("https://acme.com");
    expect(read!.strengths).toEqual(content.strengths);
    expect(read!.nextStep).toBe(content.nextStep);
    expect(read!.score.overall).toBe(content.score.overall);
    expect(read!.score.grade).toBe(content.score.grade);
    expect(read!.score.areas).toHaveLength(content.score.areas.length);
  });

  it("round-trips the thinnest audit the schema allows", async () => {
    // One finding, no impact, no strengths, no next step, no citations. If the
    // reader is stricter than the writer anywhere, it shows up here.
    companyFindFirst.mockResolvedValue(company({ evidence: [], signals: [] }));
    offerFindMany.mockResolvedValue([]);
    respondWith({
      headline: "One thing to fix",
      summary: "Short.",
      findings: [
        {
          area: "TECHNOLOGY",
          severity: "LOW",
          effort: "ONGOING",
          title: "No analytics",
          observation: "No tag manager on the page.",
          recommendation: "Install one.",
          evidenceIds: [],
        },
      ],
    });

    const content = await generateAuditContent(params);
    const read = parseStoredAuditContent(JSON.parse(JSON.stringify(asStored(content))));

    expect(read).not.toBeNull();
    expect(read!.findings[0].impact).toBeNull();
    expect(read!.findings[0].citations).toEqual([]);
    expect(read!.strengths).toEqual([]);
    expect(read!.nextStep).toBeNull();
  });
});

// ─── The write path's own judgement ────────────────────────────

describe("generateAuditContent", () => {
  it("drops citations the model invented", async () => {
    // An invented source in a document the prospect reads is the worst failure
    // this feature has, so an id that is not in the evidence set is discarded
    // rather than rendered.
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([]);
    respondWith(
      modelResponse({
        findings: [
          {
            ...modelResponse().findings[0],
            evidenceIds: ["ev-homepage", "ev-does-not-exist", "https://made-up.com"],
          },
        ],
      })
    );

    const content = await generateAuditContent(params);

    expect(content.findings[0].citations).toHaveLength(1);
    expect(content.findings[0].citations[0].title).toBe("Homepage");
  });

  it("picks the offer with the most to say, not the oldest", async () => {
    // The bug this covers: onboarding writes a "Main Offer" with a description
    // and nothing else, and the settings page writes a *second* row with the
    // real services list. Taking the oldest reliably picked the empty one, so
    // every recommendation came back unmatched even after the agency had filled
    // in exactly the field that was missing.
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([
      offer({
        id: "of-onboarding",
        name: "Main Offer",
        createdAt: new Date("2026-01-01"),
        description: "We do growth.",
      }),
      offer({
        id: "of-settings",
        createdAt: new Date("2026-06-01"),
        description: null,
        services: ["Messaging & positioning", "Conversion rate optimisation"],
        targetProblems: ["Weak inbound"],
      }),
    ]);
    respondWith(modelResponse());

    const content = await generateAuditContent(params);

    expect(content.findings[0].matchedService).toBe("Messaging & positioning");
    expect(content.unmatchedFindingCount).toBe(0);
  });

  it("counts recommendations the agency has no service for", async () => {
    // Not an error — the audit is still worth sending. But the agency should be
    // told, because the fix is theirs: fill in the services you actually sell.
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([offer({ services: ["SEO"] })]);
    respondWith(modelResponse());

    const content = await generateAuditContent(params);

    expect(content.unmatchedFindingCount).toBe(2);
    expect(content.findings.every((f) => f.matchedService === null)).toBe(true);
  });

  it("refuses a company in another workspace without saying which it is", async () => {
    companyFindFirst.mockResolvedValue(null);
    await expect(generateAuditContent(params)).rejects.toThrow(/Company not found/);
    expect(modelCreate).not.toHaveBeenCalled();
  });

  it("throws rather than inventing content when the model keeps failing", async () => {
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([]);
    modelCreate.mockRejectedValue(new Error("503 upstream"));

    await expect(generateAuditContent(params)).rejects.toThrow(/after 3 attempts/);
    expect(modelCreate).toHaveBeenCalledTimes(3);
  }, 15000); // three attempts with 1s and 2s backoff between them

  it("buckets an invented severity rather than losing the whole audit", async () => {
    // `AuditSeveritySchema` is `z.enum(...).catch("MEDIUM")`, so a severity the
    // model made up becomes MEDIUM instead of failing the run. That is the right
    // trade for one field on one finding — the audit is still worth sending, and
    // the numeric score comes from code either way. It does mean an unknown value
    // is silently reinterpreted, so this pins it as intended rather than luck.
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([]);
    respondWith(
      modelResponse({
        findings: [{ ...modelResponse().findings[0], severity: "URGENT", area: "BRANDING" }],
      })
    );

    const content = await generateAuditContent(params);

    expect(content.findings[0].severity).toBe("MEDIUM");
    expect(content.findings[0].area).toBe("POSITIONING");
  }, 15000);

  it("throws when the response is structurally wrong, rather than sending an empty audit", async () => {
    // No coercion saves this one: `findings` is `.min(1)` and `headline` is
    // `.min(1)`, because a document with no findings and no headline is not an
    // audit and must not reach the agency's outbox looking like one.
    companyFindFirst.mockResolvedValue(company());
    offerFindMany.mockResolvedValue([]);

    respondWith(modelResponse({ findings: [] }));
    await expect(generateAuditContent(params)).rejects.toThrow(/Growth audit failed for Acme Co/);

    respondWith(modelResponse({ headline: "" }));
    await expect(generateAuditContent(params)).rejects.toThrow(/Growth audit failed for Acme Co/);
  }, 20000);
});

// ─── The read path ─────────────────────────────────────────────

describe("parseStoredAuditContent", () => {
  const valid = {
    findings: [
      {
        area: "POSITIONING",
        severity: "HIGH",
        effort: "QUICK_WIN",
        title: "T",
        observation: "O",
        recommendation: "R",
      },
    ],
    score: {
      overall: 72,
      grade: "C",
      areas: [{ area: "POSITIONING", assessed: true, score: 60, findingCount: 1 }],
      confidence: "HIGH",
      confidenceReason: "Grounded in 8 sources.",
      showScore: true,
    },
  };

  it("fills in every optional field so the renderer never sees undefined", () => {
    const read = parseStoredAuditContent(valid);
    expect(read).not.toBeNull();
    expect(read!.strengths).toEqual([]);
    expect(read!.nextStep).toBeNull();
    expect(read!.unmatchedFindingCount).toBe(0);
    expect(read!.findings[0].impact).toBeNull();
    expect(read!.findings[0].matchedService).toBeNull();
    expect(read!.findings[0].citations).toEqual([]);
  });

  it("returns null instead of throwing, so one bad row is not a 500", () => {
    for (const junk of [null, undefined, "", "not json", 42, [], {}, { findings: [] }]) {
      expect(parseStoredAuditContent(junk)).toBeNull();
    }
  });

  it("returns null when the score block is missing or malformed", () => {
    expect(parseStoredAuditContent({ findings: valid.findings })).toBeNull();
    expect(
      parseStoredAuditContent({ ...valid, score: { ...valid.score, grade: "A+" } })
    ).toBeNull();
    expect(
      parseStoredAuditContent({ ...valid, score: { ...valid.score, showScore: "yes" } })
    ).toBeNull();
    expect(
      parseStoredAuditContent({ ...valid, score: { ...valid.score, confidence: "VERY_HIGH" } })
    ).toBeNull();
  });

  it("reinterprets an enum value this version does not know, rather than blanking the page", () => {
    // The read path reuses the same `.catch()` schemas as the write path, so an
    // area written by an older version of this file renders under the default
    // label instead of making the audit undisplayable. That is the better of two
    // imperfect outcomes — one mislabelled section beats "this audit can't be
    // displayed" for a document the agency has already sent — but it is a real
    // consequence of the choice, so it is pinned here rather than assumed.
    const area = parseStoredAuditContent({
      ...valid,
      findings: [{ ...valid.findings[0], area: "BRANDING" }],
    });
    expect(area!.findings[0].area).toBe("POSITIONING");

    const effort = parseStoredAuditContent({
      ...valid,
      findings: [{ ...valid.findings[0], effort: "SOMEDAY" }],
    });
    expect(effort!.findings[0].effort).toBe("PROJECT");
  });

  it("still returns null when a required field is missing outright", () => {
    // Coercion only covers the enums. Lose `title` or `recommendation` and there
    // is nothing to render, so the reader gives up instead of showing a blank.
    for (const field of ["title", "observation", "recommendation"]) {
      const broken = { ...valid.findings[0] } as Record<string, unknown>;
      delete broken[field];
      expect(parseStoredAuditContent({ ...valid, findings: [broken] })).toBeNull();
    }
  });

  it("defaults an enum that is absent, not merely unrecognised", () => {
    // `.catch()` fires on any parse failure, and a missing key is one. So a
    // finding with no `area` at all is filed under POSITIONING rather than
    // rejected — the same trade as an unknown value, worth knowing about
    // separately because "missing" and "misspelled" are usually different bugs.
    const broken = { ...valid.findings[0] } as Record<string, unknown>;
    delete broken.area;
    const read = parseStoredAuditContent({ ...valid, findings: [broken] });
    expect(read!.findings[0].area).toBe("POSITIONING");
  });

  it("keeps a citation that has only a title", () => {
    const read = parseStoredAuditContent({
      ...valid,
      findings: [{ ...valid.findings[0], citations: [{ title: "Their about page" }] }],
    });
    expect(read!.findings[0].citations[0]).toEqual({
      title: "Their about page",
      quote: null,
      sourceUrl: null,
      sourceName: null,
    });
  });

  it("allows an unassessed area to have a null score", () => {
    const read = parseStoredAuditContent({
      ...valid,
      score: {
        ...valid.score,
        areas: [{ area: "RETENTION", assessed: false, score: null, findingCount: 0 }],
      },
    });
    expect(read!.score.areas[0].score).toBeNull();
  });
});

// ─── Branding ──────────────────────────────────────────────────

describe("parseBrandSnapshot", () => {
  it("reads a full snapshot", () => {
    const brand = parseBrandSnapshot({
      name: "Northwind Growth",
      logoUrl: "https://northwind.com/logo.png",
      brandColor: "#112233",
      senderName: "Jordan Vance",
      senderTitle: "Head of Growth",
      senderEmail: "jordan@northwind.com",
      websiteUrl: "northwind.com",
    });
    expect(brand.name).toBe("Northwind Growth");
    expect(brand.senderEmail).toBe("jordan@northwind.com");
  });

  it("accepts the empty snapshot a workspace with no branding writes", () => {
    expect(parseBrandSnapshot({})).toEqual({});
  });

  it("turns nulls into absent fields, because the renderer skips absent ones", () => {
    const brand = parseBrandSnapshot({ name: "Northwind", logoUrl: null, brandColor: null });
    expect(brand.name).toBe("Northwind");
    expect(brand.logoUrl).toBe(undefined);
    expect(brand.brandColor).toBe(undefined);
  });

  it("degrades to unbranded rather than failing the page", () => {
    // A plain audit is still worth reading, and the agency would far rather
    // their prospect saw it than saw an error.
    for (const junk of [null, undefined, "nonsense", 42, [], { name: 7 }]) {
      expect(parseBrandSnapshot(junk)).toEqual({});
    }
  });
});

describe("safeBrandColor", () => {
  it("accepts plain hex in either length or case", () => {
    expect(safeBrandColor("#0071E3")).toBe("#0071E3");
    expect(safeBrandColor("#abc")).toBe("#abc");
    expect(safeBrandColor("#AABBCC")).toBe("#AABBCC");
    expect(safeBrandColor("  #0071E3  ")).toBe("#0071E3");
  });

  it("discards anything else rather than sanitising it", () => {
    // This value reaches an inline `style` on a page strangers open. Guessing at
    // intent is how a CSS injection gets through, so the fallback is the house
    // blue and that is a fine outcome.
    const hostile = [
      "red",
      "#12345",
      "#0071E33",
      "0071E3",
      "#00 71E3",
      "#zzzzzz",
      "rgb(0,0,0)",
      "blue; background-image: url(https://evil.com/x)",
      "#fff; } body { display: none",
      "var(--x)",
      "",
      undefined,
    ];
    for (const value of hostile) {
      expect(safeBrandColor(value)).toBe("#0071E3");
    }
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeBrandColor(undefined, "#000000")).toBe("#000000");
    expect(safeBrandColor("javascript:alert(1)", "#000000")).toBe("#000000");
  });
});

describe("safeLogoUrl", () => {
  it("passes http and https through", () => {
    expect(safeLogoUrl("https://a.com/logo.png")).toBe("https://a.com/logo.png");
    expect(safeLogoUrl("http://a.com/logo.png")).toBe("http://a.com/logo.png");
    expect(safeLogoUrl("HTTPS://A.com/logo.png")).toBe("HTTPS://A.com/logo.png");
    expect(safeLogoUrl("  https://a.com/logo.png  ")).toBe("https://a.com/logo.png");
  });

  it("refuses every other scheme, including the ones that look harmless", () => {
    // Returns undefined rather than a placeholder so the renderer falls back to
    // the agency's name — a wordmark instead of a broken image.
    const hostile = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "//evil.com/logo.png",
      "/logo.png",
      "logo.png",
      "ftp://a.com/logo.png",
      "",
      undefined,
    ];
    for (const value of hostile) {
      expect(safeLogoUrl(value)).toBe(undefined);
    }
  });
});

describe("MONTHLY_AUDIT_LIMIT", () => {
  it("is a positive number kept separate from the discovery budget", () => {
    // Sharing one counter with discovery would make the two features silently
    // steal from each other; an agency doing no discovery should still be able
    // to audit a prospect who walked in through the front door.
    expect(MONTHLY_AUDIT_LIMIT).toBeGreaterThan(0);
    expect(Number.isInteger(MONTHLY_AUDIT_LIMIT)).toBe(true);
  });
});
