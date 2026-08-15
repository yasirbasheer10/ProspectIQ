"use server";

import { startOrchestratorRun, pauseOrchestratorRun, stopOrchestratorRun } from "@/lib/ai/orchestrator";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function startOrchestratorAction() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";
  
  await startOrchestratorRun(workspaceId);
  revalidatePath("/agent-activity");
}

export async function pauseOrchestratorAction(runId: string) {
  await pauseOrchestratorRun(runId);
  revalidatePath("/agent-activity");
}

export async function stopOrchestratorAction(runId: string) {
  await stopOrchestratorRun(runId);
  revalidatePath("/agent-activity");
}

export async function clearAuditLogsAction() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";
  
  const { prisma } = await import("@/lib/db");
  await prisma.activity.deleteMany({ where: { type: { in: ["ORCHESTRATOR_STEP", "ORCHESTRATOR_ERROR"] } } });
  await prisma.agentRun.deleteMany({ where: { workspaceId } });
  revalidatePath("/agent-activity");
}
