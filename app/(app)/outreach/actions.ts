"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertOutreachMessageInWorkspace } from "@/lib/authz";
import { assertNotSuppressed } from "@/lib/outreach/suppression";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

// The status used to arrive as a bare `string` and go straight into Prisma, so
// any value the browser sent either landed in the column or threw a raw Prisma
// error. Only the transitions this screen actually offers are allowed.
const StatusSchema = z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SENT"]);

export async function updateOutreachStatus(id: string, status: string, newBody?: string) {
  const workspaceId = await requireWorkspaceId();

  const parsedStatus = StatusSchema.safeParse(status);
  if (!parsedStatus.success) {
    throw new Error(`"${status}" is not a status this action can set.`);
  }

  // Confirms the message belongs to the caller's workspace and gives us the
  // recipient we need for the suppression check below.
  const message = await assertOutreachMessageInWorkspace(id, workspaceId);

  // Nothing in the app sets SENT yet — there is no outbound send path. The check
  // lives here so that whichever code eventually sends has to pass it, rather
  // than being a rule someone has to remember to add later.
  if (parsedStatus.data === "SENT") {
    await assertNotSuppressed(workspaceId, {
      email: message.contact?.email,
      domain: message.opportunity?.company?.domain,
      companyId: message.opportunity?.company?.id,
    });
  }

  await prisma.outreachMessage.update({
    where: { id: message.id },
    data: {
      status: parsedStatus.data,
      ...(newBody !== undefined ? { body: newBody } : {}),
    }
  });

  revalidatePath("/outreach");
  revalidatePath("/companies/[id]", "page");
}
