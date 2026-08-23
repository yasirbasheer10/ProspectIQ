"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { revalidatePath } from "next/cache";

// The form sends "" for cleared fields rather than null, so normalise blank to
// null before validating — otherwise an empty LinkedIn box fails the URL check.
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const ProfileSchema = z.object({
  accountType: z.string().trim().min(1, "Pick an account type.").max(60),
  linkedInUrl: z.preprocess(
    blankToNull,
    z.string().trim().url("That LinkedIn URL isn't valid.").max(300).nullable()
  ),
  demographics: z.preprocess(
    blankToNull,
    z.string().trim().max(2000).nullable()
  ),
});

/**
 * The user ID used to be a parameter, so this action would update any user row
 * in the database for anyone who called it. It now comes from the session only.
 */
export async function updateUserProfile(data: {
  accountType: string;
  linkedInUrl: string | null;
  demographics: string | null;
}) {
  const { userId } = await requireWorkspace();
  const parsed = ProfileSchema.parse(data);

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountType: parsed.accountType,
      linkedInUrl: parsed.linkedInUrl,
      demographics: parsed.demographics,
    }
  });

  revalidatePath("/profile");
}
