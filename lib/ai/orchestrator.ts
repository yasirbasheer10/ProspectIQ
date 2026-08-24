import { prisma } from "../db";
import { logActivity } from "../activity";
import { researchCompany } from "./intelligence";
import { generateOutreach } from "./outreach";
import { ai, MODEL } from "./groq";

/**
 * How many companies one orchestrator run will touch.
 *
 * This was `take: 1000` under a comment that said "up to 20". 1000 was never
 * survivable: each company costs up to `MAX_ITERATIONS_PER_COMPANY` LLM calls
 * here plus a full `researchCompany` (several searches, another LLM call and a
 * Hunter.io lookup), and the whole loop runs inside one serverless invocation.
 * A thousand companies would blow the function timeout long before it finished,
 * leaving the run stuck at RUNNING until the stale-run sweep noticed.
 */
const MAX_COMPANIES_PER_RUN = 20;

/** ReAct iterations per company before we move on regardless. */
const MAX_ITERATIONS_PER_COMPANY = 5;

/**
 * Ceiling on the orchestrator's own LLM calls for one run. The per-company cap
 * bounds a single company; this bounds the run, so a pathological loop (a model
 * that never returns FINISH, say) costs a known maximum instead of running
 * until the platform kills it. Calls made *inside* `researchCompany` are not
 * counted here — `MAX_COMPANIES_PER_RUN` is what bounds those.
 */
const MAX_LLM_CALLS_PER_RUN = MAX_COMPANIES_PER_RUN * 3;

/** Spacing between LLM calls, to stay clear of the provider's rate limit. */
const RATE_LIMIT_DELAY_MS = 250;

/** Actions the ReAct loop is allowed to take. Anything else is a model error. */
const ACTIONS = ["RESEARCH", "DRAFT_OUTREACH", "FINISH"] as const;
type Action = (typeof ACTIONS)[number];

const isAction = (value: unknown): value is Action =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function isRunStillActive(runId: string, workspaceId: string) {
  // Workspace-scoped even though runId comes from a run we created ourselves:
  // it costs nothing and means no query in this file can read another
  // workspace's row if a caller is ever wired up differently.
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId },
    select: { status: true },
  });
  if (!run || run.status === "PAUSED" || run.status === "CANCELLED" || run.status === "FAILED") {
    return false; // Stop the loop
  }
  return true;
}

async function updateRunStep(runId: string, workspaceId: string, companyName: string, stepName: string, details?: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      outputData: {
        currentCompany: companyName,
        currentStep: stepName,
        details: details || "",
        lastUpdated: new Date().toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    }
  });

  // Log activity
  await logActivity(
    workspaceId,
    "ORCHESTRATOR_STEP",
    `${companyName}: ${stepName}`,
    details || "",
    { metadata: { stepName, details: details || "" } },
  );
}

export async function startOrchestratorRun(workspaceId: string) {
  // Create a new AgentRun
  const run = await prisma.agentRun.create({
    data: {
      workspaceId,
      type: "ORCHESTRATOR",
      status: "RUNNING",
      title: "Revenue Agent Orchestration Pipeline",
      startedAt: new Date()
    }
  });

  // Run the loop in the background
  orchestratorLoop(run.id, workspaceId).catch(async (error) => {
    console.error("Orchestrator crashed:", error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
  });

  return run;
}

const reactSchemaDefinition = `
{
  "thought": "Your reasoning for the next action based on the current state.",
  "action": "RESEARCH | DRAFT_OUTREACH | FINISH",
  "details": "A short, user-facing summary of what you are doing"
}
`;

/**
 * The deterministic state machine the ReAct prompt is asked to reproduce. Used
 * verbatim when the LLM call fails or returns an action outside `ACTIONS`, so a
 * provider outage degrades the reasoning rather than stalling the pipeline.
 */
function fallbackAction(stateContext: string, contactCount: number, opportunityCount: number) {
  if (stateContext.includes("Action Draft_Outreach completed")) {
    return { thought: "Outreach is drafted.", action: "FINISH" as Action, details: "Pipeline completed for this company." };
  }
  if (stateContext.includes("Action Research completed") || opportunityCount > 0) {
    if (contactCount > 0 || stateContext.includes("contact(s)")) {
      return { thought: "Research is done and there is a contact to write to.", action: "DRAFT_OUTREACH" as Action, details: "Drafting personalized email for the decision maker." };
    }
    return { thought: "Research is done but no contact was found, so there is nobody to write to.", action: "FINISH" as Action, details: "No decision maker found for this company." };
  }
  return { thought: "New company discovered, I need to research it first.", action: "RESEARCH" as Action, details: "Extracting firmographics and buying signals." };
}

async function orchestratorLoop(runId: string, workspaceId: string) {
  try {
    const companies = await prisma.company.findMany({
      where: {
        workspaceId,
        status: { in: ["DISCOVERED", "RESEARCHED"] }
      },
      include: { opportunities: true, contacts: true },
      orderBy: { createdAt: "asc" },
      take: MAX_COMPANIES_PER_RUN
    });

    // How many were left behind by the cap, so the summary can say so rather
    // than implying the whole backlog was processed.
    const eligibleCount = await prisma.company.count({
      where: { workspaceId, status: { in: ["DISCOVERED", "RESEARCHED"] } },
    });
    const skippedCount = Math.max(0, eligibleCount - companies.length);

    await prisma.agentRun.update({
      where: { id: runId },
      data: { totalItems: companies.length }
    });

    let llmCalls = 0;
    let budgetExhausted = false;
    let processedCount = 0;

    for (const company of companies) {
      if (!(await isRunStillActive(runId, workspaceId))) return;
      if (budgetExhausted) break;

      try {
        let isFinished = false;
        let iteration = 0;
        // Rule 1 of the prompt ("once outreach is drafted, FINISH") was enforced
        // only by the model. A model that keeps answering DRAFT_OUTREACH gets
        // five drafts and five duplicate messages for one contact, so the rule
        // is enforced here as well.
        let outreachDrafted = false;

        // Current state context that we will update and pass to the LLM
        let stateContext = `Company: ${company.name}\nOpportunities: ${company.opportunities.length}\nDecision Makers Found: ${company.contacts.length}`;

        while (!isFinished && iteration < MAX_ITERATIONS_PER_COMPANY) {
          if (!(await isRunStillActive(runId, workspaceId))) return;
          iteration++;

          if (llmCalls >= MAX_LLM_CALLS_PER_RUN) {
            budgetExhausted = true;
            break;
          }

          // Ask AI for the next action
          const prompt = `You are an autonomous Revenue Agent. You process companies through a sales pipeline.
          Here is the current state for the company you are processing:
          ${stateContext}

          Decide your next action based on the state. Follow these strict rules in order:
          1. If "Action Draft_Outreach completed" is in the state, YOU MUST output FINISH.
          2. If "Action Research completed" is in the state (or Opportunities > 0) AND Decision Makers > 0, BUT "Action Draft_Outreach completed" is NOT in the state, YOU MUST output DRAFT_OUTREACH.
          3. If "Action Research completed" is in the state (or Opportunities > 0) AND Decision Makers is 0, YOU MUST output FINISH — there is nobody to write to.
          4. If Opportunities is 0 AND "Action Research completed" is NOT in the state, YOU MUST output RESEARCH.

          You must return a valid JSON object matching this schema exactly:
          ${reactSchemaDefinition}
          `;

          let thought: string;
          let action: Action;
          let details: string;

          try {
            const response = await ai.chat.completions.create({
              model: MODEL,
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" }
            });
            llmCalls++;
            const parsed = JSON.parse(response.choices[0].message.content || "{}");
            if (!isAction(parsed.action)) {
              // The model answered, but not with an action we can execute.
              // Previously this fell through every branch and burned an
              // iteration doing nothing, up to five times per company.
              throw new Error(`model returned an unknown action: ${JSON.stringify(parsed.action)}`);
            }
            thought = typeof parsed.thought === "string" ? parsed.thought : "";
            action = parsed.action;
            details = typeof parsed.details === "string" ? parsed.details : "";
          } catch (apiError: unknown) {
            console.warn("LLM step failed in orchestrator:", apiError instanceof Error ? apiError.message : String(apiError));
            const fb = fallbackAction(stateContext, company.contacts.length, company.opportunities.length);
            thought = fb.thought;
            action = fb.action;
            details = fb.details;
          }

          // Update UI with the Agent's Thought and Action
          await updateRunStep(runId, workspaceId, company.name, action, `[Thought: ${thought}] -> ${details}`);

          await delay(RATE_LIMIT_DELAY_MS);

          // Execute Tool
          if (action === "RESEARCH") {
            if (company.opportunities.length === 0) {
              await researchCompany({ companyId: company.id, workspaceId });
              // Re-read so the next iteration sees the contacts and opportunity
              // that research just created. FIND_BUYER used to exist purely to
              // do this re-read and claim credit for it as a pipeline step.
              const refreshed = await prisma.company.findFirst({
                where: { id: company.id, workspaceId },
                include: { opportunities: true, contacts: true },
              });
              const contactCount = refreshed?.contacts.length ?? 0;
              stateContext += `\nAction Research completed. Opportunities: ${refreshed?.opportunities.length ?? 0}. Decision Makers Found: ${contactCount}.`;
              if (contactCount > 0) stateContext += ` Found ${contactCount} contact(s).`;
            } else {
              stateContext += `\nResearch already done.`;
            }
          }
          else if (action === "DRAFT_OUTREACH") {
            if (outreachDrafted) {
              isFinished = true;
              continue;
            }

            const updatedCompany = await prisma.company.findFirst({
              where: { id: company.id, workspaceId },
              include: { opportunities: true, contacts: true }
            });

            if (updatedCompany && updatedCompany.opportunities.length > 0 && updatedCompany.contacts.length > 0) {
              // Generate outreach for the first contact
              const opp = updatedCompany.opportunities[0];
              const contact = updatedCompany.contacts[0];

              await updateRunStep(runId, workspaceId, company.name, "DRAFT_OUTREACH", `Drafting real outreach for ${contact.fullName}...`);
              await generateOutreach(opp.id, contact.id);
              outreachDrafted = true;

              // Mark company as IN_OUTREACH
              await prisma.company.update({
                where: { id: company.id },
                data: { status: "IN_OUTREACH" }
              });

              stateContext += `\nAction Draft_Outreach completed. Pending approval.`;
            } else {
              stateContext += `\nAction Draft_Outreach failed. Missing opportunity or contact.`;
              // Nothing further can happen for this company this run; without
              // this the loop re-asked and re-failed until it ran out of
              // iterations.
              isFinished = true;
            }
            await delay(RATE_LIMIT_DELAY_MS);
          }
          else if (action === "FINISH") {
            isFinished = true;
          }
        }

        processedCount++;
        await prisma.agentRun.update({
          where: { id: runId },
          data: { processedItems: { increment: 1 } }
        });

      } catch (companyError: unknown) {
        const errorMessage = companyError instanceof Error ? companyError.message : String(companyError);
        console.error(`Error processing company ${company.name}:`, errorMessage);
        await logActivity(
          workspaceId,
          "ORCHESTRATOR_ERROR",
          `Failed processing ${company.name}`,
          errorMessage,
          { companyId: company.id, metadata: { error: errorMessage } },
        );
      }
    }

    // Say what actually happened, including what was left out. A summary that
    // reads "processed 20 companies" when 400 were eligible is how a cap turns
    // into a silent bug report.
    const summary = [`Processed ${processedCount} of ${companies.length} companies.`];
    if (skippedCount > 0) {
      summary.push(`${skippedCount} more were eligible but left for the next run (limit ${MAX_COMPANIES_PER_RUN} per run).`);
    }
    if (budgetExhausted) {
      summary.push(`Stopped early: hit the ${MAX_LLM_CALLS_PER_RUN}-call budget for a single run.`);
    }

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resultSummary: summary.join(" ")
      }
    });

  } catch (globalError: unknown) {
    const errorMsg = globalError instanceof Error ? globalError.message : String(globalError);
    console.error("Fatal orchestrator error:", errorMsg);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: errorMsg, completedAt: new Date() }
    });
  }
}

// Both of these are reached from a server action that receives `runId` from the
// browser, so the workspace is part of the `where` rather than checked first:
// a run id belonging to someone else matches no row and the count tells us.
export async function pauseOrchestratorRun(runId: string, workspaceId: string) {
  const { count } = await prisma.agentRun.updateMany({
    where: { id: runId, workspaceId },
    data: { status: "PAUSED" }
  });
  if (count === 0) throw new Error("That run was not found in your workspace.");
}

export async function stopOrchestratorRun(runId: string, workspaceId: string) {
  const { count } = await prisma.agentRun.updateMany({
    where: { id: runId, workspaceId },
    data: { status: "CANCELLED", completedAt: new Date() }
  });
  if (count === 0) throw new Error("That run was not found in your workspace.");
}
