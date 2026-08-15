"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateOutreachStatus(id: string, status: string, newBody?: string) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { status };
  if (newBody !== undefined) {
    data.body = newBody;
  }
  
  await prisma.outreachMessage.update({
    where: { id },
    data
  });
  
  revalidatePath("/outreach");
  revalidatePath("/companies/[id]", "page");
}
