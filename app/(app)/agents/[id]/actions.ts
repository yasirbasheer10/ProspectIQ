"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function toggleAgentStatus(agentId: string, isActive: boolean) {
  await prisma.customAgent.update({
    where: { id: agentId },
    data: { isActive }
  });
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}
