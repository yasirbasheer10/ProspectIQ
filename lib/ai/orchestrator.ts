import { prisma } from "../db";
import { logActivity } from "../activity";
import { researchCompany } from "./intelligence";
import { generateOutreach } from "./outreach";
// Assuming discovery handles ICP -> Discovery
// Assuming intelligence handles Research -> Evidence -> Signals -> Opportunity -> Score -> Buyer
// Assuming outreach handles Channel -> Outreach

// A simple delay function to simulate agent "thinking" time for demo UI
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function checkRunStatus(runId: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
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

import { ai } from "./gemini";

const reactSchemaDefinition = `
{
  "thought": "Your reasoning for the next action based on the current state.",
  "action": "RESEARCH | FIND_BUYER | DRAFT_OUTREACH | FINISH",
  "details": "A short, user-facing summary of what you are doing"
}
`;

async function orchestratorLoop(runId: string, workspaceId: string) {
  try {
    // Get up to 20 companies to process
    const companies = await prisma.company.findMany({
      where: { 
        workspaceId, 
        status: { in: ["DISCOVERED", "RESEARCHED"] } 
      },
      include: { opportunities: true, contacts: true },
      take: 1000
    });

    await prisma.agentRun.update({
      where: { id: runId },
      data: { totalItems: companies.length }
    });

    for (const company of companies) {
      if (!(await checkRunStatus(runId))) return;

      try {
        let isFinished = false;
        let iteration = 0;
        const maxIterations = 5;

        // Current state context that we will update and pass to the LLM
        let stateContext = `Company: ${company.name}\nOpportunities: ${company.opportunities.length}\nDecision Makers Found: ${company.contacts.length}`;

        while (!isFinished && iteration < maxIterations) {
          if (!(await checkRunStatus(runId))) return;
          iteration++;

          // Ask AI for the next action
          const prompt = `You are an autonomous Revenue Agent. You process companies through a sales pipeline.
          Here is the current state for the company you are processing:
          ${stateContext}
          
          Decide your next action based on the state. Follow these strict rules in order:
          1. If "Action Draft_Outreach completed" is in the state, YOU MUST output FINISH.
          2. If "Action Find_Buyer completed" is in the state (or Decision Makers > 0), BUT "Action Draft_Outreach completed" is NOT in the state, YOU MUST output DRAFT_OUTREACH.
          3. If "Action Research completed" is in the state (or Opportunities > 0), BUT "Action Find_Buyer completed" is NOT in the state, YOU MUST output FIND_BUYER.
          4. If Opportunities is 0 AND "Action Research completed" is NOT in the state, YOU MUST output RESEARCH.
          
          You must return a valid JSON object matching this schema exactly:
          ${reactSchemaDefinition}
          `;

          let reactOutput;
          try {
            const response = await ai.chat.completions.create({
              model: "openai/gpt-oss-120b",
              messages: [{ role: "user", content: prompt }],
              response_format: { type: "json_object" }
            });
            reactOutput = JSON.parse(response.choices[0].message.content || "{}");
          } catch (apiError: unknown) {
            console.warn("LLM API failed in orchestrator:", apiError instanceof Error ? apiError.message : String(apiError));
            // Fallback simplistic logic
            if (stateContext.includes("Action Draft_Outreach completed")) {
              reactOutput = { thought: "Outreach is drafted.", action: "FINISH", details: "Pipeline completed for this company." };
            } else if (stateContext.includes("Action Find_Buyer completed") || company.contacts.length > 0) {
              reactOutput = { thought: "Decision makers found, I need to draft outreach.", action: "DRAFT_OUTREACH", details: "Drafting personalized email for the decision maker." };
            } else if (stateContext.includes("Action Research completed") || company.opportunities.length > 0) {
              reactOutput = { thought: "Opportunity exists, now I need to find the right buyer.", action: "FIND_BUYER", details: "Searching for the ideal buyer persona." };
            } else {
              reactOutput = { thought: "New company discovered, I need to research it first.", action: "RESEARCH", details: "Extracting firmographics and buying signals." };
            }
          }

          const { thought, action, details } = reactOutput;

          // Update UI with the Agent's Thought and Action
          await updateRunStep(runId, workspaceId, company.name, action, `[Thought: ${thought}] -> ${details}`);
          
          await delay(1000); // Small delay to avoid API limits

          // Execute Tool
          if (action === "RESEARCH") {
            if (company.opportunities.length === 0) {
              await researchCompany({ companyId: company.id, workspaceId });
              stateContext += `\nAction Research completed. Found 1 opportunity.`;
            } else {
              stateContext += `\nResearch already done.`;
            }
          } 
          else if (action === "FIND_BUYER") {
            // Find buyer is currently part of intelligence, so if we are here, we might just need to refresh company data
            const updatedCompany = await prisma.company.findUnique({
              where: { id: company.id },
              include: { opportunities: true, contacts: true }
            });
            if (updatedCompany && updatedCompany.contacts.length > 0) {
              stateContext += `\nAction Find_Buyer completed. Found ${updatedCompany.contacts.length} contact(s).`;
            } else {
              stateContext += `\nAction Find_Buyer completed. Found 0 contacts.`;
            }
          } 
          else if (action === "DRAFT_OUTREACH") {
            const updatedCompany = await prisma.company.findUnique({
              where: { id: company.id },
              include: { opportunities: true, contacts: true }
            });
            
            if (updatedCompany && updatedCompany.opportunities.length > 0 && updatedCompany.contacts.length > 0) {
              // Generate outreach for the first contact
              const opp = updatedCompany.opportunities[0];
              const contact = updatedCompany.contacts[0];
              
              await updateRunStep(runId, workspaceId, company.name, "DRAFT_OUTREACH", `Drafting real outreach for ${contact.fullName}...`);
              await generateOutreach(opp.id, contact.id);
              
              // Mark company as IN_OUTREACH
              await prisma.company.update({
                where: { id: company.id },
                data: { status: "IN_OUTREACH" }
              });
              
              stateContext += `\nAction Draft_Outreach completed. Pending approval.`;
            } else {
              stateContext += `\nAction Draft_Outreach failed. Missing opportunity or contact.`;
            }
            await delay(1000);
          } 
          else if (action === "FINISH") {
            isFinished = true;
          }
        }

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

    await prisma.agentRun.update({
      where: { id: runId },
      data: { 
        status: "COMPLETED", 
        completedAt: new Date(),
        resultSummary: `Successfully processed ${companies.length} companies.`
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
