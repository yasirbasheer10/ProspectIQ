"use server";

import { startOrchestratorRun, pauseOrchestratorRun, stopOrchestratorRun } from "@/lib/ai/orchestrator";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function startOrchestratorAction() {
  const workspaceId = await requireWorkspaceId();
  
  await startOrchestratorRun(workspaceId);
  revalidatePath("/agent-activity");
}

export async function pauseOrchestratorAction(runId: string) {
  const workspaceId = await requireWorkspaceId();
  await pauseOrchestratorRun(runId, workspaceId);
  revalidatePath("/agent-activity");
}

export async function stopOrchestratorAction(runId: string) {
  const workspaceId = await requireWorkspaceId();
  await stopOrchestratorRun(runId, workspaceId);
  revalidatePath("/agent-activity");
}

export async function clearAuditLogsAction() {
  const workspaceId = await requireWorkspaceId();

  const { prisma } = await import("@/lib/db");
  // `workspaceId` was missing from this deleteMany, so one workspace clearing
  // its audit log deleted every workspace's orchestrator activity.
  await prisma.activity.deleteMany({
    where: { workspaceId, type: { in: ["ORCHESTRATOR_STEP", "ORCHESTRATOR_ERROR"] } }
  });
  await prisma.agentRun.deleteMany({ where: { workspaceId } });
  revalidatePath("/agent-activity");
}
