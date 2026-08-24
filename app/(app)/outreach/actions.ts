"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertOutreachMessageInWorkspace } from "@/lib/authz";
import { assertNotSuppressed } from "@/lib/outreach/suppression";
import { FEATURES, OUTBOUND_DISABLED_REASON } from "@/lib/features";
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

  // `SENT` means "this left the building". Nothing in the app can make that true
  // yet — there is no outbound send path — so accepting the transition would put
  // a row in the database saying an email was delivered when none was. Refuse it
  // until `ENABLE_OUTBOUND_SENDING` is on and something actually sends.
  //
  // The suppression check stays on this transition rather than moving into the
  // future sender, so whichever code eventually sends has to pass it instead of
  // it being a rule someone has to remember to add.
  if (parsedStatus.data === "SENT") {
    if (!FEATURES.outboundSending) {
      throw new Error(OUTBOUND_DISABLED_REASON);
    }
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
