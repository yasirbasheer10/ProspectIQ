import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
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

  // fallback to fixtures if empty for demo purposes
  const finalQueue = queue.length > 0 ? queue : [
    {
      id: "out-1",
      contact: "Sarah Jenkins",
      company: "Acme Commerce",
      subject: "Reducing friction in Acme's checkout flow",
      status: "PENDING_APPROVAL",
      preview: "Hi Sarah, I noticed Acme Commerce recently redesigned its checkout flow...",
    },
    {
      id: "out-2",
      contact: "Marcus Chen",
      company: "Vertalo Group",
      subject: "Scaling agency outbound without adding headcount",
      status: "PENDING_APPROVAL",
      preview: "Hi Marcus, congrats on joining Vertalo from Salesforce. Having led EMEA partnerships...",
    }
  ];

  return <OutreachClient initialQueue={finalQueue} />;
}
