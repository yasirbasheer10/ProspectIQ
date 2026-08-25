/**
 * Tests: Discovery engine (`lib/ai/discovery.ts`)
 *
 * Every external dependency is mocked: Postgres, Groq, Serper and the Jina
 * reader. What is being tested is the engine's own decision-making, and above
 * all its honesty — the P0 work removed a set of hardcoded fallbacks that made
 * a completely failed run look like a successful one (three plausible domains
 * appeared, companies were "discovered", the run went green). These tests pin
 * that behaviour down so it cannot come back.
 */

import { runDiscoveryEngine, parseStoredDiscoveryOutput } from "@/lib/ai/discovery";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { ai } from "@/lib/ai/groq";
import { performSearch } from "@/lib/ai/search";

jest.mock("@/lib/db", () => ({
  prisma: {
    agentRun: { update: jest.fn() },
    iCP: { findFirst: jest.fn() },
    company: { upsert: jest.fn() },
    signal: { create: jest.fn() },
    activity: { create: jest.fn() },
  },
}));

jest.mock("@/lib/activity", () => ({ logActivity: jest.fn() }));

jest.mock("@/lib/ai/groq", () => ({
  ai: { chat: { completions: { create: jest.fn() } } },
  MODEL: "test-model",
}));

jest.mock("@/lib/ai/search", () => ({ performSearch: jest.fn() }));

const mocked = (fn: unknown) => fn as jest.Mock;

const agentRunUpdate = mocked(prisma.agentRun.update);
const icpFindFirst = mocked(prisma.iCP.findFirst);
const companyUpsert = mocked(prisma.company.upsert);
const signalCreate = mocked(prisma.signal.create);
const activity = mocked(logActivity);
const llm = mocked(ai.chat.completions.create);
const search = mocked(performSearch);

/** A Groq chat completion carrying `body` as its JSON content. */
const completion = (body: unknown) => ({
  choices: [{ message: { content: JSON.stringify(body) } }],
});

/** One Serper page of organic results. */
const serperPage = (links: string[]) => ({
  organic: links.map((link) => ({
    title: `${link} — we are hiring`,
    link: `https://${link}/careers`,
    snippet: `${link} is growing its engineering team.`,
  })),
});

/**
 * Routes the two distinct LLM calls the engine makes by looking at the prompt,
 * rather than by call order — domains are processed in concurrent batches of 3,
 * so ordering is not deterministic.
 */
function stubLlm(opts: {
  domains?: unknown;
  extraction?: unknown | ((prompt: string) => unknown);
  failExtraction?: boolean;
}) {
  llm.mockImplementation(async (args: { messages: { content: string }[] }) => {
    const prompt = args.messages[0].content;
    if (prompt.includes("B2B lead generation researcher")) {
      return completion(opts.domains ?? { domains: [] });
    }
    if (opts.failExtraction) throw new Error("Groq is down");
    const extraction =
      typeof opts.extraction === "function"
        ? (opts.extraction as (p: string) => unknown)(prompt)
        : opts.extraction;
    return completion(extraction ?? { name: "Fallback", domain: "fallback.com" });
  });
}

/** The `data` of the agentRun.update call that set a terminal status. */
function terminalRunUpdate() {
  const call = agentRunUpdate.mock.calls
    .map(([arg]) => arg)
    .reverse()
    .find((arg) => arg?.data?.status === "COMPLETED" || arg?.data?.status === "FAILED");
  return call?.data;
}

const activityTypes = () => activity.mock.calls.map(([, type]) => type);

const RUN = { workspaceId: "ws_1", agentRunId: "run_1" };

const ICP = {
  countries: { "United States": ["ALL"] },
  industries: ["Fintech"],
  size: "50-200",
  keywords: ["hiring"],
  excludeKeywords: [] as string[],
};

describe("runDiscoveryEngine", () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SERPER_API_KEY = "test-key";

    agentRunUpdate.mockResolvedValue({});
    icpFindFirst.mockResolvedValue(null);
    signalCreate.mockResolvedValue({});
    activity.mockResolvedValue({});
    companyUpsert.mockImplementation(async ({ create }: { create: { name: string } }) => ({
      id: `co_${create.name}`,
      name: create.name,
      industry: "Fintech",
    }));

    // Jina reader: a page with some plausible text on it.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "# Acme Payments\n\nWe are hiring engineers in Austin.",
    }) as unknown as typeof fetch;

    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("moves the run to RUNNING before doing any work", async () => {
    search.mockResolvedValue(serperPage(["acme.io"]));
    stubLlm({ domains: { domains: ["acme.io"] }, extraction: { name: "Acme", domain: "acme.io" } });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    // A run created QUEUED and only ever moved to COMPLETED/FAILED was
    // indistinguishable from one that never started.
    const first = agentRunUpdate.mock.calls[0][0];
    expect(first.data.status).toBe("RUNNING");
    expect(first.data.startedAt).toBeInstanceOf(Date);
  });

  describe("when the search finds nothing", () => {
    it("fails the run and writes no companies", async () => {
      search.mockResolvedValue(null); // every query angle failed
      stubLlm({});

      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      // This is the anti-fake-data guarantee. It used to return
      // acme.com / globaltech.io / zephyr-systems.co and report success.
      expect(companyUpsert).not.toHaveBeenCalled();
      expect(signalCreate).not.toHaveBeenCalled();
      expect(terminalRunUpdate()?.status).toBe("FAILED");
      // And no results list. An empty one would read, to the Companies page, as
      // a search that ran fine and matched nothing.
      expect(terminalRunUpdate()?.outputData).toBeUndefined();
    });

    it("records a reason on the run, not just in the console", async () => {
      search.mockResolvedValue(null);
      stubLlm({});

      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      const message = terminalRunUpdate()?.errorMessage as string;
      expect(message).toMatch(/Target search failed/);
      // The distinction matters: a dead SERPER_API_KEY is a different problem
      // from an ICP that genuinely matches nothing.
      expect(message).toMatch(/SERPER_API_KEY/);
      expect(activityTypes()).toContain("RUN_ERROR");
    });

    it("distinguishes 'queries failed' from 'queries returned nothing'", async () => {
      search.mockResolvedValue({ organic: [] }); // reached Serper, no results
      stubLlm({});

      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      const message = terminalRunUpdate()?.errorMessage as string;
      expect(message).toMatch(/returned no results/);
      expect(message).not.toMatch(/SERPER_API_KEY/);
    });

    it("fails when the model returns an empty domain list", async () => {
      search.mockResolvedValue(serperPage(["acme.io"]));
      stubLlm({ domains: { domains: [] } });

      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      expect(companyUpsert).not.toHaveBeenCalled();
      expect(terminalRunUpdate()?.status).toBe("FAILED");
      expect(activityTypes()).toContain("NO_RESULTS");
    });

    it("fails when the model omits the domains key entirely", async () => {
      search.mockResolvedValue(serperPage(["acme.io"]));
      stubLlm({ domains: { note: "I could not find any" } });

      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      expect(companyUpsert).not.toHaveBeenCalled();
      expect(terminalRunUpdate()?.status).toBe("FAILED");
    });
  });

  describe("on a successful run", () => {
    beforeEach(() => {
      search.mockResolvedValue(serperPage(["acme.io"]));
      stubLlm({
        domains: { domains: ["acme.io"] },
        extraction: {
          name: "Acme Payments",
          domain: "acme.io",
          industry: "Fintech",
          description: "Payments for SMBs.",
          companySize: "50-200",
          location: "Austin, TX",
          signals: [{ type: "HIRING", title: "Hiring engineers", description: "Three open roles." }],
        },
      });
    });

    it("upserts the company on the workspace + domain key", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      expect(companyUpsert).toHaveBeenCalledTimes(1);
      const arg = companyUpsert.mock.calls[0][0];
      expect(arg.where.workspaceId_domain).toEqual({ workspaceId: "ws_1", domain: "acme.io" });
      expect(arg.create.name).toBe("Acme Payments");
      expect(arg.create.headquarters).toBe("Austin, TX");
    });

    it("saves the extracted signals with no invented relevance score", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      expect(signalCreate).toHaveBeenCalledTimes(1);
      const data = signalCreate.mock.calls[0][0].data;
      expect(data.type).toBe("HIRING");
      expect(data.title).toBe("Hiring engineers");
      // Was hardcoded to 0.9 — a confidence nothing had measured.
      expect(data.relevance).toBeNull();
    });

    it("counts the domain as processed and completes the run", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      expect(agentRunUpdate.mock.calls.some(([a]) => a.data?.totalItems === 1)).toBe(true);
      expect(agentRunUpdate.mock.calls.some(([a]) => a.data?.processedItems?.increment === 1)).toBe(true);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("records which companies it found on the finished run", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP });

      // The only place this is written down. Nothing else in the schema links a
      // company back to the run that found it — `Company` has no `agentRunId`,
      // and `discoverySource` is written once on create — so without this the
      // Companies page can only ever show the entire workspace.
      const output = parseStoredDiscoveryOutput(terminalRunUpdate()?.outputData);
      expect(output).toEqual({
        companyIds: ["co_Acme Payments"],
        requestedDomains: 1,
      });
    });

    it("labels the company as discovery unless told otherwise", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP });
      expect(companyUpsert.mock.calls[0][0].create.discoverySource).toBe("discovery");
    });

    it("passes a caller's label through to the company row", async () => {
      await runDiscoveryEngine({ ...RUN, icpParams: ICP, source: "lookalike" });

      // What makes a company first met through "find companies like these"
      // distinguishable later. On `create` only — see `IngestDomainParams`.
      expect(companyUpsert.mock.calls[0][0].create.discoverySource).toBe("lookalike");
      expect(companyUpsert.mock.calls[0][0].update.discoverySource).toBeUndefined();
    });
  });

  it("lists a company once when two requested domains resolve to it", async () => {
    search.mockResolvedValue(serperPage(["acme.io", "blog.acme.io"]));
    stubLlm({
      domains: { domains: ["acme.io", "blog.acme.io"] },
      extraction: { name: "Acme", domain: "acme.io" },
    });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    // Both pages extract to the same company, so the upsert hands the same id
    // back twice. Listing it twice would overstate what the run found, and would
    // make the Companies page's "shown of read" line disagree with its own table.
    const output = parseStoredDiscoveryOutput(terminalRunUpdate()?.outputData);
    expect(output?.companyIds).toEqual(["co_Acme"]);
    // Still 2: this counts sites the run set out to read, failures included.
    expect(output?.requestedDomains).toBe(2);
  });

  it("writes an invented signal type as PRESS_MENTION instead of failing the insert", async () => {
    search.mockResolvedValue(serperPage(["acme.io"]));
    stubLlm({
      domains: { domains: ["acme.io"] },
      extraction: {
        name: "Acme",
        domain: "acme.io",
        signals: [{ type: "ACQUISITION_RUMOUR", title: "Rumoured buyout" }],
      },
    });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    // The raw string used to go straight into a Postgres enum column, which
    // failed mid-loop after the company row was already written.
    expect(signalCreate.mock.calls[0][0].data.type).toBe("PRESS_MENTION");
    expect(terminalRunUpdate()?.status).toBe("COMPLETED");
  });

  it("skips a domain whose extraction is unusable but still finishes the run", async () => {
    search.mockResolvedValue(serperPage(["acme.io", "good.io"]));
    stubLlm({
      domains: { domains: ["acme.io", "good.io"] },
      // acme.io comes back with no name, which the schema rejects.
      extraction: (prompt: string) =>
        prompt.includes("acme.io")
          ? { description: "Something, but no name or domain." }
          : { name: "Good Co", domain: "good.io" },
    });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    expect(companyUpsert).toHaveBeenCalledTimes(1);
    expect(companyUpsert.mock.calls[0][0].create.domain).toBe("good.io");
    expect(activityTypes()).toContain("SCRAPE_FAILED");
    // One bad page must not abort the batch.
    expect(terminalRunUpdate()?.status).toBe("COMPLETED");
  });

  it("keeps going when a domain throws outright", async () => {
    search.mockResolvedValue(serperPage(["acme.io", "good.io"]));
    stubLlm({
      domains: { domains: ["acme.io", "good.io"] },
      extraction: { name: "Good Co", domain: "good.io" },
    });
    companyUpsert
      .mockRejectedValueOnce(new Error("unique constraint violated"))
      .mockResolvedValueOnce({ id: "co_2", name: "Good Co", industry: "Fintech" });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    expect(activityTypes()).toContain("SCRAPE_FAILED");
  });

  it("drops household-name enterprises the model let through", async () => {
    search.mockResolvedValue(serperPage(["amazon.com", "acme.io"]));
    stubLlm({
      domains: { domains: ["amazon.com", "WWW.Walmart.com", "acme.io"] },
      extraction: { name: "Acme", domain: "acme.io" },
    });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    // A deterministic Set lookup, not a prompt instruction the model can miss.
    // Casing and a www. prefix must not get past it.
    expect(companyUpsert).toHaveBeenCalledTimes(1);
    expect(companyUpsert.mock.calls[0][0].create.domain).toBe("acme.io");
  });

  it("fails rather than processing giants when every result is excluded", async () => {
    search.mockResolvedValue(serperPage(["amazon.com", "walmart.com"]));
    stubLlm({
      domains: { domains: ["amazon.com", "walmart.com"] },
      extraction: { name: "Amazon", domain: "amazon.com" },
    });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    expect(companyUpsert).not.toHaveBeenCalled();
    expect(terminalRunUpdate()?.status).toBe("FAILED");
  });

  it("skips the search entirely for a manual domain list", async () => {
    stubLlm({ extraction: { name: "Manual Co", domain: "manual.io" } });

    await runDiscoveryEngine({ ...RUN, customDomains: ["manual.io"] });

    expect(search).not.toHaveBeenCalled();
    expect(activityTypes()).toContain("MANUAL_IMPORT");
    expect(companyUpsert).toHaveBeenCalledTimes(1);
    expect(terminalRunUpdate()?.status).toBe("COMPLETED");
  });

  it("still analyses a domain whose page could not be fetched", async () => {
    // Jina fails; the model gets an empty page. Whether it can say anything
    // useful is its problem — the engine must not crash on the empty string.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 451, text: async () => "" }) as unknown as typeof fetch;
    stubLlm({ extraction: { name: "Manual Co", domain: "manual.io" } });

    await runDiscoveryEngine({ ...RUN, customDomains: ["manual.io"] });

    expect(terminalRunUpdate()?.status).toBe("COMPLETED");
  });

  it("fails the run when the domain-extraction LLM call is dead", async () => {
    search.mockResolvedValue(serperPage(["acme.io"]));
    llm.mockRejectedValue(new Error("401 Invalid API key"));

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    expect(companyUpsert).not.toHaveBeenCalled();
    expect(terminalRunUpdate()?.status).toBe("FAILED");
    expect(terminalRunUpdate()?.errorMessage).toMatch(/Invalid API key/);
  });

  it("builds several query angles rather than one 'top companies' query", async () => {
    search.mockResolvedValue(serperPage(["acme.io"]));
    stubLlm({ domains: { domains: ["acme.io"] }, extraction: { name: "Acme", domain: "acme.io" } });

    await runDiscoveryEngine({ ...RUN, icpParams: ICP });

    const queries = search.mock.calls.map(([q]) => q as string);
    expect(queries.length).toBeGreaterThan(1);
    // "Top/Best X" phrasing surfaces listicles full of category leaders.
    for (const q of queries) {
      expect(q.toLowerCase()).not.toMatch(/\b(top|best)\b/);
      // Serper rejects very long queries outright.
      expect(q.length).toBeLessThan(200);
    }
  });

  it("adds the user's exclusions as negative search terms", async () => {
    search.mockResolvedValue(serperPage(["acme.io"]));
    stubLlm({ domains: { domains: ["acme.io"] }, extraction: { name: "Acme", domain: "acme.io" } });

    await runDiscoveryEngine({
      ...RUN,
      icpParams: { ...ICP, excludeKeywords: ["Stripe", "Adyen"] },
    });

    const queries = search.mock.calls.map(([q]) => q as string);
    expect(queries.every((q) => q.includes('-"Stripe"') && q.includes('-"Adyen"'))).toBe(true);
  });

  it("falls back to the stored ICP when the caller passes none", async () => {
    icpFindFirst.mockResolvedValue({
      industries: ["Logistics"],
      countries: ["Germany"],
      companySize: "200-500",
      buyingSignals: ["expanding"],
      excludeKeywords: [],
    });
    search.mockResolvedValue(serperPage(["acme.io"]));
    stubLlm({ domains: { domains: ["acme.io"] }, extraction: { name: "Acme", domain: "acme.io" } });

    await runDiscoveryEngine(RUN);

    expect(icpFindFirst).toHaveBeenCalledWith({ where: { workspaceId: "ws_1" } });
    const queries = search.mock.calls.map(([q]) => q as string);
    expect(queries.some((q) => q.includes("Logistics") && q.includes("Germany"))).toBe(true);
  });
});

/**
 * The read side of `AgentRun.outputData` for discovery runs.
 *
 * This is what stands between a hand-edited `?run=` link and the Companies page,
 * and it is guarding a `Json?` column — TypeScript sees `any` there, so the
 * compiler cannot help at all. Everything a caller passes in is untrusted.
 */
describe("parseStoredDiscoveryOutput", () => {
  it("round-trips what the engine writes", () => {
    const written = { companyIds: ["co_1", "co_2"], requestedDomains: 5 };
    expect(parseStoredDiscoveryOutput(written)).toEqual(written);
  });

  it("reads a run that found nothing as a run that found nothing", () => {
    // Distinct from a run with no record at all, which is the whole reason the
    // return type is nullable rather than defaulting to an empty list.
    expect(parseStoredDiscoveryOutput({ companyIds: [], requestedDomains: 3 })).toEqual({
      companyIds: [],
      requestedDomains: 3,
    });
  });

  it("returns null for a run that recorded nothing", () => {
    // Every discovery run that finished before this existed. The Companies page
    // says so out loud instead of showing "0 companies".
    expect(parseStoredDiscoveryOutput(null)).toBeNull();
    expect(parseStoredDiscoveryOutput(undefined)).toBeNull();
  });

  it("returns null for values that are not an object", () => {
    expect(parseStoredDiscoveryOutput("companyIds")).toBeNull();
    expect(parseStoredDiscoveryOutput(42)).toBeNull();
    expect(parseStoredDiscoveryOutput(true)).toBeNull();
    // An array is `typeof "object"`, and `"companyIds" in []` is false, but the
    // explicit check means that does not have to be relied on.
    expect(parseStoredDiscoveryOutput(["co_1"])).toBeNull();
  });

  it("returns null for another engine's output blob", () => {
    // The reason for the `"companyIds" in` check. Both fields below have a
    // `.catch()`, so without it these would parse to `{companyIds: [], ...}` —
    // an intelligence run would look like a discovery run that found nothing,
    // and `?run=<that id>` would show an empty Companies table with a confident
    // explanation attached to it.
    expect(parseStoredDiscoveryOutput({ rawOutput: "...", scores: { overall: 80 } })).toBeNull();
    expect(
      parseStoredDiscoveryOutput({
        currentCompany: "Acme",
        currentStep: "Enriching",
        details: "",
        lastUpdated: new Date().toISOString(),
      })
    ).toBeNull();
    // A lookalike run's profile blob, for the same reason.
    expect(parseStoredDiscoveryOutput({ profile: { name: "Mid-market fintech" } })).toBeNull();
  });

  it("recovers the ids when the rest of the blob is junk", () => {
    // Half-written or hand-edited. The ids are the load-bearing part; a bad
    // count only weakens one sentence of explanatory text, so it degrades to 0
    // rather than throwing away a list of real companies.
    expect(parseStoredDiscoveryOutput({ companyIds: ["co_1"], requestedDomains: "five" })).toEqual({
      companyIds: ["co_1"],
      requestedDomains: 0,
    });
    expect(parseStoredDiscoveryOutput({ companyIds: ["co_1"], requestedDomains: -2 })).toEqual({
      companyIds: ["co_1"],
      requestedDomains: 0,
    });
    expect(parseStoredDiscoveryOutput({ companyIds: ["co_1"] })).toEqual({
      companyIds: ["co_1"],
      requestedDomains: 0,
    });
  });

  it("drops a company id list that is not a list of ids", () => {
    // These end up in a Prisma `id: { in: [...] }`, so a number or an object
    // slipping through would be a query-time crash on a page load rather than
    // an empty table.
    expect(parseStoredDiscoveryOutput({ companyIds: "co_1", requestedDomains: 1 })).toEqual({
      companyIds: [],
      requestedDomains: 1,
    });
    expect(parseStoredDiscoveryOutput({ companyIds: [1, 2], requestedDomains: 2 })).toEqual({
      companyIds: [],
      requestedDomains: 2,
    });
    expect(parseStoredDiscoveryOutput({ companyIds: null, requestedDomains: 2 })).toEqual({
      companyIds: [],
      requestedDomains: 2,
    });
  });
});
