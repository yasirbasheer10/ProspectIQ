/**
 * Tests: Orchestrator (`lib/ai/orchestrator.ts`)
 *
 * The ReAct loop is an LLM deciding what to do next, which means the guardrails
 * around it matter more than the reasoning inside it. What is under test: the
 * per-run company cap, the LLM-call budget, cooperative cancellation, the
 * deterministic fallback when the model is unavailable or answers with an action
 * that does not exist, and the honesty of the closing summary.
 */

import {
  startOrchestratorRun,
  pauseOrchestratorRun,
  stopOrchestratorRun,
} from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { ai } from "@/lib/ai/groq";
import { researchCompany } from "@/lib/ai/intelligence";
import { generateOutreach } from "@/lib/ai/outreach";

jest.mock("@/lib/db", () => ({
  prisma: {
    agentRun: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    company: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@/lib/activity", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/ai/groq", () => ({
  ai: { chat: { completions: { create: jest.fn() } } },
  MODEL: "test-model",
}));
jest.mock("@/lib/ai/intelligence", () => ({ researchCompany: jest.fn() }));
jest.mock("@/lib/ai/outreach", () => ({ generateOutreach: jest.fn() }));

const mocked = (fn: unknown) => fn as jest.Mock;

const runCreate = mocked(prisma.agentRun.create);
const runUpdate = mocked(prisma.agentRun.update);
const runUpdateMany = mocked(prisma.agentRun.updateMany);
const runFindFirst = mocked(prisma.agentRun.findFirst);
const companyFindMany = mocked(prisma.company.findMany);
const companyFindFirst = mocked(prisma.company.findFirst);
const companyCount = mocked(prisma.company.count);
const companyUpdate = mocked(prisma.company.update);
const llm = mocked(ai.chat.completions.create);
const research = mocked(researchCompany);
const outreach = mocked(generateOutreach);

const completion = (body: unknown) => ({ choices: [{ message: { content: JSON.stringify(body) } }] });

/** A company that has been researched and has a contact — ready for outreach. */
const readyCompany = (id: string) => ({
  id,
  name: `Company ${id}`,
  opportunities: [{ id: `opp_${id}` }],
  contacts: [{ id: `c_${id}`, fullName: "Dana Reed" }],
});

/** A freshly discovered company with nothing on it yet. */
const rawCompany = (id: string) => ({ id, name: `Company ${id}`, opportunities: [], contacts: [] });

/**
 * `startOrchestratorRun` fires the loop without awaiting it, and the loop spaces
 * its LLM calls with real `setTimeout` delays. Every test runs on fake timers so
 * draining is a matter of advancing the clock past those delays rather than
 * sleeping for them.
 */
const drain = () => jest.advanceTimersByTimeAsync(300_000);

const terminalRunUpdate = () =>
  runUpdate.mock.calls
    .map(([a]) => a)
    .reverse()
    .find((a) => a?.data?.status === "COMPLETED" || a?.data?.status === "FAILED")?.data;

/** Every action the loop asked the model for, in order. */
const actionsTaken = () =>
  runUpdate.mock.calls
    .map(([a]) => a?.data?.outputData?.currentStep)
    .filter((s): s is string => typeof s === "string");

describe("orchestrator", () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    runCreate.mockResolvedValue({ id: "run_1" });
    runUpdate.mockResolvedValue({});
    runUpdateMany.mockResolvedValue({ count: 1 });
    runFindFirst.mockResolvedValue({ status: "RUNNING" });
    companyCount.mockResolvedValue(1);
    companyUpdate.mockResolvedValue({});
    research.mockResolvedValue({});
    outreach.mockResolvedValue({});

    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("the per-run company cap", () => {
    it("asks for at most 20 companies", async () => {
      companyFindMany.mockResolvedValue([]);
      companyCount.mockResolvedValue(0);

      await startOrchestratorRun("ws_1");
      await drain();

      // Was `take: 1000` under a comment that said "up to 20". A thousand
      // companies cannot finish inside one serverless invocation.
      expect(companyFindMany.mock.calls[0][0].take).toBe(20);
    });

    it("takes the oldest first, so a backlog drains in order", async () => {
      companyFindMany.mockResolvedValue([]);
      companyCount.mockResolvedValue(0);

      await startOrchestratorRun("ws_1");
      await drain();

      expect(companyFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "asc" });
    });

    it("says in the summary how many it left behind", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyCount.mockResolvedValue(437);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm.mockResolvedValue(completion({ thought: "done", action: "FINISH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      // A cap that reports "processed 1 company" while 436 wait is a silent
      // truncation — it reads as "covered everything".
      expect(terminalRunUpdate()?.resultSummary).toMatch(/436 more were eligible/);
      expect(terminalRunUpdate()?.resultSummary).toMatch(/limit 20 per run/);
    });

    it("says nothing about skipping when it processed the whole backlog", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyCount.mockResolvedValue(1);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm.mockResolvedValue(completion({ thought: "done", action: "FINISH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(terminalRunUpdate()?.resultSummary).not.toMatch(/eligible/);
      expect(terminalRunUpdate()?.resultSummary).toMatch(/Processed 1 of 1 companies/);
    });
  });

  describe("the LLM-call budget", () => {
    it("stops the run once the budget is spent and says so", async () => {
      // 20 companies, and a model that never says FINISH: without a budget this
      // is 20 x 5 = 100 calls. The budget caps it at 60.
      const companies = Array.from({ length: 20 }, (_, i) => rawCompany(`c${i}`));
      companyFindMany.mockResolvedValue(companies);
      companyCount.mockResolvedValue(20);
      companyFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
        rawCompany(where.id)
      );
      llm.mockResolvedValue(completion({ thought: "keep going", action: "RESEARCH", details: "" }));

      await startOrchestratorRun("ws_1");
      await jest.advanceTimersByTimeAsync(600_000);

      expect(llm.mock.calls.length).toBeLessThanOrEqual(60);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
      expect(terminalRunUpdate()?.resultSummary).toMatch(/hit the 60-call budget/);
    });

    it("does not mention the budget on a normal run", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm.mockResolvedValue(completion({ thought: "done", action: "FINISH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(terminalRunUpdate()?.resultSummary).not.toMatch(/budget/);
    });
  });

  describe("cooperative cancellation", () => {
    it("abandons the loop when the run has been paused", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a"), readyCompany("b")]);
      companyCount.mockResolvedValue(2);
      runFindFirst.mockResolvedValue({ status: "PAUSED" });

      await startOrchestratorRun("ws_1");
      await drain();

      expect(llm).not.toHaveBeenCalled();
      // A paused run must not be overwritten with COMPLETED.
      expect(terminalRunUpdate()).toBeUndefined();
    });

    it("abandons the loop when the run has been cancelled", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      runFindFirst.mockResolvedValue({ status: "CANCELLED" });

      await startOrchestratorRun("ws_1");
      await drain();

      expect(llm).not.toHaveBeenCalled();
    });

    it("stops if the run row has vanished", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      runFindFirst.mockResolvedValue(null);

      await startOrchestratorRun("ws_1");
      await drain();

      expect(llm).not.toHaveBeenCalled();
    });

    it("scopes the status check to the workspace", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm.mockResolvedValue(completion({ thought: "done", action: "FINISH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(runFindFirst.mock.calls[0][0].where).toEqual({ id: "run_1", workspaceId: "ws_1" });
    });
  });

  describe("when the model is unavailable or wrong", () => {
    it("falls back to the deterministic state machine on an API failure", async () => {
      llm.mockRejectedValue(new Error("503 service unavailable"));
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));

      await startOrchestratorRun("ws_1");
      await drain();

      // A researched company with a contact should still get its outreach
      // drafted without the model's help.
      expect(outreach).toHaveBeenCalledWith("opp_a", "c_a");
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("falls back when the model returns an action that does not exist", async () => {
      // FIND_BUYER was one of these until it was removed: a no-op step that
      // appended "completed" to the state whether or not it found anything.
      llm.mockResolvedValue(completion({ thought: "hmm", action: "FIND_BUYER", details: "" }));
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(actionsTaken()).not.toContain("FIND_BUYER");
      expect(outreach).toHaveBeenCalledTimes(1);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("does not spin through every iteration on a nonsense action", async () => {
      llm.mockResolvedValue(completion({ action: "DO_A_BARREL_ROLL" }));
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));

      await startOrchestratorRun("ws_1");
      await drain();

      // The unknown action used to match no branch, burn an iteration and be
      // asked again — five times per company.
      expect(llm.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it("researches a raw company when the model is down", async () => {
      llm.mockRejectedValue(new Error("dead"));
      companyFindMany.mockResolvedValue([rawCompany("a")]);
      companyFindFirst.mockResolvedValue(rawCompany("a"));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(research).toHaveBeenCalledWith({ companyId: "a", workspaceId: "ws_1" });
    });
  });

  describe("the happy path", () => {
    it("researches, then drafts, then finishes", async () => {
      companyFindMany.mockResolvedValue([rawCompany("a")]);
      // After research the company has an opportunity and a contact.
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm
        .mockResolvedValueOnce(completion({ thought: "new", action: "RESEARCH", details: "" }))
        .mockResolvedValueOnce(completion({ thought: "write", action: "DRAFT_OUTREACH", details: "" }))
        .mockResolvedValueOnce(completion({ thought: "done", action: "FINISH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(research).toHaveBeenCalledTimes(1);
      expect(outreach).toHaveBeenCalledWith("opp_a", "c_a");
      expect(companyUpdate).toHaveBeenCalledWith({ where: { id: "a" }, data: { status: "IN_OUTREACH" } });
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("gives up on a company with no contact instead of retrying the draft", async () => {
      companyFindMany.mockResolvedValue([{ ...rawCompany("a"), opportunities: [{ id: "opp_a" }] }]);
      companyFindFirst.mockResolvedValue({ ...rawCompany("a"), opportunities: [{ id: "opp_a" }] });
      llm.mockResolvedValue(completion({ thought: "write", action: "DRAFT_OUTREACH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(outreach).not.toHaveBeenCalled();
      // One attempt, not five.
      expect(llm).toHaveBeenCalledTimes(1);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("drafts outreach once per company even if the model keeps asking", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      // A model that never moves on. Five drafts would be five duplicate
      // messages to the same contact.
      llm.mockResolvedValue(completion({ thought: "write", action: "DRAFT_OUTREACH", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      expect(outreach).toHaveBeenCalledTimes(1);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
    });

    it("keeps going after one company throws", async () => {
      companyFindMany.mockResolvedValue([readyCompany("a"), readyCompany("b")]);
      companyCount.mockResolvedValue(2);
      companyFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
        readyCompany(where.id)
      );
      llm.mockResolvedValue(completion({ thought: "write", action: "DRAFT_OUTREACH", details: "" }));
      outreach.mockRejectedValueOnce(new Error("Groq refused")).mockResolvedValueOnce({});

      await startOrchestratorRun("ws_1");
      await drain();

      expect(outreach).toHaveBeenCalledTimes(2);
      expect(terminalRunUpdate()?.status).toBe("COMPLETED");
      expect(terminalRunUpdate()?.resultSummary).toMatch(/Processed 1 of 2 companies/);
    });

    it("scopes the company query to the workspace and the two eligible statuses", async () => {
      companyFindMany.mockResolvedValue([]);
      companyCount.mockResolvedValue(0);

      await startOrchestratorRun("ws_1");
      await drain();

      expect(companyFindMany.mock.calls[0][0].where).toEqual({
        workspaceId: "ws_1",
        status: { in: ["DISCOVERED", "RESEARCHED"] },
      });
    });

    it("re-reads the company after research so the next step sees the new contact", async () => {
      companyFindMany.mockResolvedValue([rawCompany("a")]);
      companyFindFirst.mockResolvedValue(readyCompany("a"));
      llm
        .mockResolvedValueOnce(completion({ action: "RESEARCH", thought: "", details: "" }))
        .mockResolvedValue(completion({ action: "FINISH", thought: "", details: "" }));

      await startOrchestratorRun("ws_1");
      await drain();

      // This re-read is all FIND_BUYER ever did.
      expect(companyFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "a", workspaceId: "ws_1" } })
      );
    });
  });

  it("marks the run FAILED when the company query itself dies", async () => {
    companyFindMany.mockRejectedValue(new Error("connection terminated"));

    await startOrchestratorRun("ws_1");
    await drain();

    expect(terminalRunUpdate()?.status).toBe("FAILED");
    expect(terminalRunUpdate()?.errorMessage).toMatch(/connection terminated/);
  });

  describe("pause and stop", () => {
    it("scopes the pause to the workspace", async () => {
      await pauseOrchestratorRun("run_1", "ws_1");

      expect(runUpdateMany).toHaveBeenCalledWith({
        where: { id: "run_1", workspaceId: "ws_1" },
        data: { status: "PAUSED" },
      });
    });

    it("rejects a run id from another workspace", async () => {
      runUpdateMany.mockResolvedValue({ count: 0 });

      await expect(pauseOrchestratorRun("run_someone_else", "ws_1")).rejects.toThrow(
        /not found in your workspace/
      );
      await expect(stopOrchestratorRun("run_someone_else", "ws_1")).rejects.toThrow(
        /not found in your workspace/
      );
    });

    it("stamps a completion time when stopping", async () => {
      await stopOrchestratorRun("run_1", "ws_1");

      const data = runUpdateMany.mock.calls[0][0].data;
      expect(data.status).toBe("CANCELLED");
      expect(data.completedAt).toBeInstanceOf(Date);
    });
  });
});
