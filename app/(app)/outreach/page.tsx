import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { FEATURES } from "@/lib/features";
import { OutreachClient } from "./OutreachClient";

export default async function OutreachPage() {
  const workspaceId = await requireWorkspaceId();

  const dbMessages = await prisma.outreachMessage.findMany({
    where: { 
      status: "DRAFT",
      opportunity: {
        workspaceId
      }
    },
    include: {
      contact: true,
      opportunity: {
        include: {
          company: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const queue = dbMessages.map(msg => ({
    id: msg.id,
    contact: msg.contact ? `${msg.contact.firstName} ${msg.contact.lastName}` : "Unknown Contact",
    company: msg.opportunity?.company?.name || "Unknown Company",
    subject: msg.subject || "No Subject",
    status: msg.status,
    preview: msg.body.substring(0, 150) + (msg.body.length > 150 ? "..." : "")
  }));

  // No fixture fallback. This list used to be seeded with two invented drafts
  // ("Sarah Jenkins" at "Acme Commerce", "Marcus Chen" at "Vertalo Group")
  // whenever the queue was empty, which meant the "You're all caught up" empty
  // state could never appear — and clicking "Approve & Send" on one optimistically
  // removed the card, then threw server-side because no such message exists. The
  // screen reported sending a message that was never real.
  return (
    <OutreachClient initialQueue={queue} outboundSendingEnabled={FEATURES.outboundSending} />
  );
}
