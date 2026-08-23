"use server";

import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function toggleAgentStatus(agentId: string, isActive: boolean) {
  const workspaceId = await requireWorkspaceId();

  // Scoped update: an agent ID from another workspace matches nothing.
  const { count } = await prisma.customAgent.updateMany({
    where: { id: agentId, workspaceId },
    data: { isActive }
  });

  if (count === 0) {
    throw new Error("That agent was not found in your workspace.");
  }

  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}
