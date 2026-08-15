"use server";

import { processIncomingReply } from "@/lib/ai/conversation";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function simulateReplyAction(conversationId: string, intentType: string) {
  try {
    let mockBody = "";
    switch (intentType) {
      case "INTERESTED":
        mockBody = "This sounds really interesting. I'd love to learn more.";
        break;
      case "QUESTION":
        mockBody = "Does your platform integrate directly with Salesforce?";
        break;
      case "OBJECTION":
        mockBody = "We're currently using a competitor and don't have budget to switch this quarter.";
        break;
      case "NOT_NOW":
        mockBody = "Not a priority right now, reach back out in 6 months.";
        break;
      case "MEETING_REQUEST":
        mockBody = "Do you have time for a quick call next Tuesday at 10 AM EST?";
        break;
      case "UNSUBSCRIBE":
        mockBody = "Please remove me from your mailing list.";
        break;
      default:
        mockBody = "Thanks for reaching out.";
        break;
    }

    await processIncomingReply(conversationId, mockBody);
    revalidatePath("/conversations");
    return { success: true };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Failed to simulate reply:", error);
    return { success: false, error: error.message };
  }
}

export async function processConversationAction(messageId: string, actionType: "APPROVE" | "REJECT" | "MANUAL") {
  try {
    const message = await prisma.conversationMessage.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });
    
    if (!message) throw new Error("Message not found.");

    if (actionType === "APPROVE") {
      // In a real system, send the email here.
      // We will create the outbound message.
      await prisma.conversationMessage.create({
        data: {
          conversationId: message.conversationId,
          direction: "outbound",
          body: message.suggestedReply || "Approved response",
          sentAt: new Date(),
        }
      });
      // Clear suggested action since it was handled
      await prisma.conversation.update({
        where: { id: message.conversationId },
        data: { suggestedAction: null, suggestedActionReason: null }
      });
    } else if (actionType === "REJECT" || actionType === "MANUAL") {
      // Clear suggested action so the user can take over
      await prisma.conversation.update({
        where: { id: message.conversationId },
        data: { suggestedAction: null, suggestedActionReason: null }
      });
    }

    revalidatePath("/conversations");
    return { success: true };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Failed to process conversation action:", error);
    return { success: false, error: error.message };
  }
}
