import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { CompaniesClient } from "./CompaniesClient";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const workspaceId = await requireWorkspaceId();

  const q = searchParams?.q || "";
  const page = parseInt(searchParams?.page || "1");
  const pageSize = 50;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    workspaceId,
  };

  if (q) {
    whereClause.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { domain: { contains: q, mode: "insensitive" } },
      { industry: { contains: q, mode: "insensitive" } },
    ];
  }

  const [companies, totalItems] = await Promise.all([
    prisma.company.findMany({
      where: whereClause,
      include: {
        opportunities: {
          include: {
            score: true,
          },
        },
        _count: {
          select: { signals: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.company.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <CompaniesClient 
      companies={companies} 
      totalItems={totalItems} 
      totalPages={totalPages} 
      currentPage={page} 
      searchQueryParam={q}
    />
  );
}
