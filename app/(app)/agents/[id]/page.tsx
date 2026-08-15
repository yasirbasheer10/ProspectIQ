import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentDashboardClient } from "./AgentDashboardClient";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await prisma.customAgent.findUnique({
    where: { id },
    include: {
      companies: {
        take: 50,
        orderBy: { createdAt: 'desc' }
      },
      contacts: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { company: true }
      },
      _count: {
        select: {
          companies: true,
          contacts: true,
          outreachMessages: true,
        }
      }
    }
  });

  if (!agent) {
    redirect("/agents");
  }

  return <AgentDashboardClient agent={agent} />;
}
