"use server";

import { researchCompany } from "@/lib/ai/intelligence";
import { generateOutreach } from "@/lib/ai/outreach";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function triggerIntelligenceRun(companyId: string, workspaceId: string) {
  try {
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
    const message = await generateOutreach(opportunityId, contactId, existingMessageId);
    revalidatePath(`/companies/${companyId}`);
    return { success: true, messageId: message.id };
  } catch (error: unknown) {
    console.error("Failed to generate outreach:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateOutreachAction(companyId: string, messageId: string, data: { status?: "DRAFT" | "APPROVED" | "REJECTED"; subject?: string; body?: string }) {
  try {
    await prisma.outreachMessage.update({
      where: { id: messageId },
      data
    });
    revalidatePath(`/companies/${companyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update outreach:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
