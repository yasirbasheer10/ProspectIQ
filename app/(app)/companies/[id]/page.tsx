import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { Company360Client } from "./Company360Client";

export default async function Company360Page({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await requireWorkspaceId();
  const { id } = await params;

  const company = await prisma.company.findFirst({
    where: { 
      id,
      workspaceId 
    },
    include: {
      signals: true,
      evidence: true,
      contacts: true,
      opportunities: {
        include: {
          score: true,
          outreachMessages: {
            orderBy: { createdAt: 'desc' }
          }
        }
      }
    }
  });

  return <Company360Client company={company} />;
}
