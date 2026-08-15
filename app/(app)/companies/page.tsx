import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { CompaniesClient } from "./CompaniesClient";

export default async function CompaniesPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  const companies = await prisma.company.findMany({
    where: { workspaceId },
    include: {
      opportunities: {
        include: {
          score: true,
        },
      },
      _count: {
        select: { signals: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return <CompaniesClient companies={companies} />;
}
