"use server";

import { z } from "zod";
import { processIncomingReply } from "@/lib/ai/conversation";
import { prisma } from "@/lib/db";
import { assertConversationInWorkspace, assertConversationMessageInWorkspace } from "@/lib/authz";
import { FEATURES, OUTBOUND_DISABLED_REASON } from "@/lib/features";
import { requireWorkspaceId } from "@/lib/session";
import { revalidatePath } from "next/cache";

const MOCK_REPLIES: Record<string, string> = {
  INTERESTED: "This sounds really interesting. I'd love to learn more.",
  QUESTION: "Does your platform integrate directly with Salesforce?",
  OBJECTION: "We're currently using a competitor and don't have budget to switch this quarter.",
  NOT_NOW: "Not a priority right now, reach back out in 6 months.",
  MEETING_REQUEST: "Do you have time for a quick call next Tuesday at 10 AM EST?",
  UNSUBSCRIBE: "Please remove me from your mailing list.",
};

const IntentSchema = z.enum(["INTERESTED", "QUESTION", "OBJECTION", "NOT_NOW", "MEETING_REQUEST", "UNSUBSCRIBE"]);
const ActionSchema = z.enum(["APPROVE", "REJECT", "MANUAL"]);

export async function simulateReplyAction(conversationId: string, intentType: string) {
  try {
    const workspaceId = await requireWorkspaceId();
    await assertConversationInWorkspace(conversationId, workspaceId);

    // Unknown intents used to fall through to a generic "Thanks for reaching
    // out." reply, which silently simulated something other than what the
    // caller asked for.
    const intent = IntentSchema.parse(intentType);

    await processIncomingReply(conversationId, MOCK_REPLIES[intent]);
    revalidatePath("/conversations");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to simulate reply:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function processConversationAction(messageId: string, actionType: "APPROVE" | "REJECT" | "MANUAL") {
  try {
    const workspaceId = await requireWorkspaceId();
    const message = await assertConversationMessageInWorkspace(messageId, workspaceId);
    const action = ActionSchema.parse(actionType);

    if (action === "APPROVE") {
      // Approving records the reply the user signed off on — that decision is
      // real and belongs in the thread. What it does *not* do is send it.
      //
      // `sentAt` is non-nullable with a `now()` default, so this row will carry a
      // timestamp whether or not anything was transmitted; making it nullable is a
      // schema change and there are no migrations yet (P2 item 19). Until then the
      // column means "recorded at" for outbound rows, and the UI says so rather
      // than implying delivery. The comment here used to read "In a real system,
      // send the email here", which described the gap without marking it.
      if (!FEATURES.outboundSending) {
        console.log(
          `[conversations] Reply approved for conversation ${message.conversationId} ` +
          `but not sent — ${OUTBOUND_DISABLED_REASON}`
        );
      }

      await prisma.conversationMessage.create({
        data: {
          conversationId: message.conversationId,
          direction: "outbound",
          body: message.suggestedReply || "Approved response",
          sentAt: new Date(),
        }
      });
    }

    // Every branch clears the suggestion: approving handles it, rejecting and
    // taking over manually both hand control back to the user.
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { suggestedAction: null, suggestedActionReason: null }
    });

    revalidatePath("/conversations");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to process conversation action:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
