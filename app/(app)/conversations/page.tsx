import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { FEATURES } from "@/lib/features";
import { ConversationsClient } from "./ConversationsClient";

export default async function ConversationsPage() {
  const workspaceId = await requireWorkspaceId();

  const conversations = await prisma.conversation.findMany({
    where: { 
      contact: {
        workspaceId
      }
    },
    include: {
      contact: {
        include: { company: true }
      },
      messages: {
        orderBy: { sentAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <ConversationsClient
      conversations={conversations}
      outboundSendingEnabled={FEATURES.outboundSending}
    />
  );
}
