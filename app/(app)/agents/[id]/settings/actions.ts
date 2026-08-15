"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateAgentAction(agentId: string, data: { name: string; goal: string; isActive: boolean }) {
  await prisma.customAgent.update({
    where: { id: agentId },
    data: {
      name: data.name,
      goal: data.goal,
      isActive: data.isActive,
    }
  });

  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath(`/agents/${agentId}/settings`);
}

export async function deleteAgentAction(agentId: string) {
  await prisma.customAgent.delete({
    where: { id: agentId }
  });
  revalidatePath("/agents");
}
