import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { parseStoredDiscoveryOutput } from "@/lib/ai/discovery";
import { CompaniesClient, type RunFilterView } from "./CompaniesClient";

export default async function CompaniesPage({
  searchParams,
}: {
  // A promise since Next 15; the synchronous form was still tolerated then but
  // is gone in 16. Typing it as a plain object made `searchParams?.q` read a
  // property off the promise itself, which is always undefined — so the search
  // box and pagination silently did nothing on a page load.
  searchParams: Promise<{ q?: string; page?: string; run?: string }>;
}) {
  const workspaceId = await requireWorkspaceId();

  const params = await searchParams;
  const q = params.q || "";
  const runId = params.run || "";
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

  // ── "Show me only what one run returned" ──────────────────────────────────
  //
  // Reached from the lookalike search, which lands here with its own run id so
  // the agency sees just the companies that search produced instead of its whole
  // list. Kept as a filter on this page rather than a second list somewhere else:
  // there is one Companies table, with the search, scores, signal counts and
  // paging already built, and a parallel one would drift from it.
  //
  // Scoped to the workspace, and note it must be: without the `workspaceId` here
  // any run id would resolve, and `title` would come back with it.
  let runFilter: RunFilterView | null = null;

  if (runId) {
    const run = await prisma.agentRun.findFirst({
      where: { id: runId, workspaceId },
      select: { id: true, title: true, outputData: true },
    });

    if (!run) {
      runFilter = { kind: "missing", id: runId };
      // Deliberately still filtered, to nothing. Quietly falling back to the
      // full list would look like the search had returned every company in the
      // workspace.
      whereClause.id = { in: [] };
    } else {
      const output = parseStoredDiscoveryOutput(run.outputData);

      if (!output) {
        // Every discovery run that finished before results were recorded lands
        // here. Its companies are real and still in the list, they just cannot
        // be told apart any more — which is worth saying out loud rather than
        // rendering as "0 results".
        runFilter = { kind: "untracked", id: run.id, title: run.title };
        whereClause.id = { in: [] };
      } else {
        runFilter = {
          kind: "tracked",
          id: run.id,
          title: run.title,
          requestedDomains: output.requestedDomains,
        };
        whereClause.id = { in: output.companyIds };
      }
    }
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
      runFilter={runFilter}
    />
  );
}
