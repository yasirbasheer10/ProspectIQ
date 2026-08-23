"use server";

import { requireWorkspaceId } from "@/lib/session";
import { startOrchestratorRun } from "@/lib/ai/orchestrator";

export async function startOrchestratorAction() {
  const workspaceId = await requireWorkspaceId();
  await startOrchestratorRun(workspaceId);
}
