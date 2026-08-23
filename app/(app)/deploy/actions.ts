"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

const DeploySchema = z.object({
  name: z.string().trim().min(1, "Give the agent a name.").max(120),
  goal: z.string().trim().max(2000).optional(),
  tools: z.array(z.string().trim().min(1)).max(50),
  schedule: z.enum(["continuous", "daily", "weekly"]),
  budgetLimit: z.coerce.number().int().min(0).max(1_000_000),
});

/**
 * `workspaceId` was part of the payload, so this created agents in whatever
 * workspace the browser named. It now comes from the session.
 */
export async function deployCustomAgent(data: {
  name: string;
  goal: string;
  tools: string[];
  schedule: string;
  budgetLimit: number;
}) {
  const workspaceId = await requireWorkspaceId();
  const parsed = DeploySchema.parse(data);

  await prisma.customAgent.create({
    data: {
      workspaceId,
      name: parsed.name,
      goal: parsed.goal,
      tools: parsed.tools,
      schedule: parsed.schedule,
      budgetLimit: parsed.budgetLimit,
    },
  });

  revalidatePath("/deploy");
  revalidatePath("/dashboard");
  revalidatePath("/agents");
}
