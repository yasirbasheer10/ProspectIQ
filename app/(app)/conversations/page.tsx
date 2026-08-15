import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ConversationsClient } from "./ConversationsClient";

export default async function ConversationsPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

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

  return <ConversationsClient conversations={conversations} />;
}
