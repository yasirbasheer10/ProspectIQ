"use server";

import { getSession } from "@/lib/session";
import { startOrchestratorRun } from "@/lib/ai/orchestrator";

export async function startOrchestratorAction() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";
  await startOrchestratorRun(workspaceId);
}
