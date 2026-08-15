"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function deployCustomAgent(data: {
  workspaceId: string;
  name: string;
  goal: string;
  tools: string[];
  schedule: string;
  budgetLimit: number;
}) {
  await prisma.customAgent.create({
    data: {
      workspaceId: data.workspaceId,
      name: data.name,
      goal: data.goal,
      tools: data.tools,
      schedule: data.schedule,
      budgetLimit: data.budgetLimit,
    },
  });

  revalidatePath("/deploy");
  revalidatePath("/dashboard");
  revalidatePath("/agents");
}
