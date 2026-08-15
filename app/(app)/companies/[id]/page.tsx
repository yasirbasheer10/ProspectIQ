import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { Company360Client } from "./Company360Client";

export default async function Company360Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";
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
