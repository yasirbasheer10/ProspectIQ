"use server";

import { z } from "zod";
import { researchCompany } from "@/lib/ai/intelligence";
import { generateOutreach } from "@/lib/ai/outreach";
import { prisma } from "@/lib/db";
import {
  assertCompanyInWorkspace,
  assertContactInWorkspace,
  assertOpportunityInWorkspace,
  assertOutreachMessageInWorkspace,
} from "@/lib/authz";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

/**
 * `workspaceId` used to be a parameter supplied by the browser, so a caller
 * could research a company into someone else's workspace. It now comes from the
 * session, and the company ID is checked against it.
 */
export async function triggerIntelligenceRun(companyId: string) {
  try {
    const workspaceId = await requireWorkspaceId();
    await assertCompanyInWorkspace(companyId, workspaceId);

    await researchCompany({ companyId, workspaceId });
    revalidatePath(`/companies/${companyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to run intelligence:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function generateOutreachAction(companyId: string, opportunityId: string, contactId: string, existingMessageId?: string) {
  try {
    const workspaceId = await requireWorkspaceId();
    await assertCompanyInWorkspace(companyId, workspaceId);
    await assertOpportunityInWorkspace(opportunityId, workspaceId);
    await assertContactInWorkspace(contactId, workspaceId);
    if (existingMessageId) {
      await assertOutreachMessageInWorkspace(existingMessageId, workspaceId);
    }

    const message = await generateOutreach(opportunityId, contactId, existingMessageId);
    revalidatePath(`/companies/${companyId}`);
    return { success: true, messageId: message.id };
  } catch (error: unknown) {
    console.error("Failed to generate outreach:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const OutreachEditSchema = z.object({
  status: z.enum(["DRAFT", "APPROVED", "REJECTED"]).optional(),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20000).optional(),
});

export async function updateOutreachAction(companyId: string, messageId: string, data: { status?: "DRAFT" | "APPROVED" | "REJECTED"; subject?: string; body?: string }) {
  try {
    const workspaceId = await requireWorkspaceId();
    const message = await assertOutreachMessageInWorkspace(messageId, workspaceId);
    const parsed = OutreachEditSchema.parse(data);

    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: parsed
    });
    revalidatePath(`/companies/${companyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update outreach:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
