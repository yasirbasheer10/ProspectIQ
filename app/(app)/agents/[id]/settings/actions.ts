"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

const AgentSettingsSchema = z.object({
  name: z.string().trim().min(1, "Give the agent a name.").max(120),
  goal: z.string().trim().max(2000),
  isActive: z.boolean(),
});

export async function updateAgentAction(agentId: string, data: { name: string; goal: string; isActive: boolean }) {
  const workspaceId = await requireWorkspaceId();
  const parsed = AgentSettingsSchema.parse(data);

  const { count } = await prisma.customAgent.updateMany({
    where: { id: agentId, workspaceId },
    data: {
      name: parsed.name,
      goal: parsed.goal,
      isActive: parsed.isActive,
    }
  });

  if (count === 0) {
    throw new Error("That agent was not found in your workspace.");
  }

  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath(`/agents/${agentId}/settings`);
}

export async function deleteAgentAction(agentId: string) {
  const workspaceId = await requireWorkspaceId();

  const { count } = await prisma.customAgent.deleteMany({
    where: { id: agentId, workspaceId }
  });

  if (count === 0) {
    throw new Error("That agent was not found in your workspace.");
  }

  revalidatePath("/agents");
}
