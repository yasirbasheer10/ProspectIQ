import { ai } from "./groq";
import { prisma } from "../db";
import { ReplyClassification } from "@prisma/client";

const conversationSchemaDefinition = `
{
  "intent": "INTERESTED | QUESTION | OBJECTION | NOT_NOW | REFERRAL | MEETING_REQUEST | NEGATIVE | UNSUBSCRIBE | UNKNOWN",
  "suggestedAction": "A short, actionable recommendation for the user",
  "opportunityStatus": "QUALIFIED | WON | LOST | null",
  "suggestedReply": "A drafted email response to send back",
  "summary": "A 1-2 sentence summary of what the prospect said"
}
`;

export async function processIncomingReply(conversationId: string, inboundMessageBody: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: {
        include: { company: true }
      },
      messages: {
        orderBy: { sentAt: "asc" }
      }
    }
  });

  if (!conversation || !conversation.contact) {
    throw new Error("Conversation or Contact not found.");
  }

  // Find associated opportunity (if any)
  const opportunity = await prisma.opportunity.findFirst({
    where: {
      companyId: conversation.contact.companyId,
      status: { not: "LOST" }
    },
    orderBy: { score: { overallScore: "desc" } }
  });

  const previousMessages = conversation.messages.map(m => `[${m.direction.toUpperCase()}]: ${m.body}`).join("\n\n");

  const prompt = `
You are an expert AI sales assistant responsible for Conversation Intelligence. 

Context:
Prospect Name: ${conversation.contact.fullName}
Company: ${conversation.contact.company?.name || "Unknown"}
Our Goal: Book a meeting to discuss our services.

Conversation History:
${previousMessages}

NEW INBOUND REPLY:
${inboundMessageBody}

Task:
1. Classify the exact intent of the reply. Must be one of: INTERESTED, QUESTION, OBJECTION, NOT_NOW, REFERRAL, MEETING_REQUEST, NEGATIVE, UNSUBSCRIBE, UNKNOWN.
2. Recommend the best next action (e.g., "Send meeting link", "Address pricing objection").
3. Determine if the Opportunity Status should change. For example, if UNSUBSCRIBE, it's LOST. If MEETING_REQUEST or INTERESTED, maybe QUALIFIED. Otherwise return null.
4. Draft a highly professional, concise response to this reply. If it's an UNSUBSCRIBE, just draft a short "No problem, taking you off the list."
5. Provide a short summary of the prospect's reply.

You must return valid JSON matching this schema exactly:
${conversationSchemaDefinition}
`;

  try {
    const response = await ai.chat.completions.create({
      model: "groq/compound-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const text = response.choices[0].message.content;
    if (!text) throw new Error("Empty response from AI");
    
    const data = JSON.parse(text);

    const intent = data.intent as ReplyClassification;

    // 1. Create the Inbound Message
    const inboundMessage = await prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: "inbound",
        body: inboundMessageBody,
        classification: intent,
        aiSummary: data.summary,
        suggestedReply: data.suggestedReply,
      }
    });

    // 2. Update the Conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastClassification: intent,
        suggestedAction: data.suggestedAction,
        lastReplyAt: new Date(),
        replyCount: { increment: 1 }
      }
    });

    // 3. Handle UNSUBSCRIBE
    if (intent === "UNSUBSCRIBE") {
      await prisma.contact.update({
        where: { id: conversation.contact.id },
        data: { isUnsubscribed: true }
      });
    }

    // 4. Update Opportunity if suggested
    if (opportunity && data.opportunityStatus && ["CONVERTED", "LOST"].includes(data.opportunityStatus)) {
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: { status: data.opportunityStatus as "CONVERTED" | "LOST" }
      });
    }

    return {
      message: inboundMessage,
      intent,
      action: data.suggestedAction,
      replyDraft: data.suggestedReply
    };

  } catch (error: unknown) {
    console.error("Conversation Classification Error:", error instanceof Error ? error.message : String(error));
    
    // Fallback simple creation
    const inboundMessage = await prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: "inbound",
        body: inboundMessageBody,
        classification: "UNKNOWN" as ReplyClassification,
        aiSummary: "Could not classify message due to an error.",
        suggestedReply: "Thanks for getting back to me.",
      }
    });
    
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastClassification: "UNKNOWN" as ReplyClassification,
        suggestedAction: "Review manually",
        lastReplyAt: new Date(),
        replyCount: { increment: 1 }
      }
    });
    
    return {
      message: inboundMessage,
      intent: "UNKNOWN",
      action: "Review manually",
      replyDraft: "Thanks for getting back to me."
    };
  }
}
