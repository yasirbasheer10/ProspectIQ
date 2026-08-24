import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { CompaniesClient } from "./CompaniesClient";

export default async function CompaniesPage({
  searchParams,
}: {
  // A promise since Next 15; the synchronous form was still tolerated then but
  // is gone in 16. Typing it as a plain object made `searchParams?.q` read a
  // property off the promise itself, which is always undefined — so the search
  // box and pagination silently did nothing on a page load.
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const workspaceId = await requireWorkspaceId();

  const params = await searchParams;
  const q = params.q || "";
  // `?page=abc` used to give NaN, and NaN skip/take makes Prisma throw.
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
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
