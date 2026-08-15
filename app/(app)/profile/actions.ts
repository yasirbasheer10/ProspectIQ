"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateUserProfile(userId: string, data: {
  accountType: string;
  linkedInUrl: string | null;
  demographics: string | null;
}) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      accountType: data.accountType,
      linkedInUrl: data.linkedInUrl,
      demographics: data.demographics,
    }
  });

  revalidatePath("/profile");
}
