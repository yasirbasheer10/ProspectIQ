import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { formatDistanceToNow } from "date-fns";
import { parseStoredDiscoveryOutput, runKindFromTitle } from "@/lib/ai/discovery";
import { CompaniesClient, type RunFilterView, type RunOption } from "./CompaniesClient";

/** How many recent runs to read before filtering out the ones with no results. */
const RUN_SCAN_DEPTH = 25;
/** How many end up in the picker. Enough to reach back a few weeks of searching. */
const RUN_OPTIONS_SHOWN = 8;

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

  // ── The searches you can go back to ───────────────────────────────────────
  //
  // Without this the filter above was a one-way door: it could only be switched
  // on by the redirect at the end of a lookalike search, and clearing it lost the
  // way back for good. Now the same control that clears it also puts it back.
  //
  // Read on every load of this page rather than passed along from the search,
  // because the point is to reach a search you ran days ago, from a page you
  // arrived at from the sidebar. In the same `Promise.all` as the list itself so
  // it costs no extra round trip — it shares nothing with the other two queries.
  const [companies, totalItems, recentRuns] = await Promise.all([
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
    prisma.agentRun.findMany({
      // Lookalike searches are DISCOVERY runs too — `startDiscovery` creates them,
      // and only the title differs. That is deliberate: both fill the same list,
      // so both belong in this picker.
      where: { workspaceId, type: "DISCOVERY", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: RUN_SCAN_DEPTH,
      select: { id: true, title: true, createdAt: true, outputData: true },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  // Filtered in JS, not in the query. Two reasons: `outputData` is `Json?`, where
  // a `not: null` filter needs `Prisma.DbNull` and silently misbehaves with a
  // plain null; and "recorded results" is a shape question the parser already
  // answers, so asking Postgres to guess at it would be a second, weaker copy of
  // the same rule.
  const runOptions: RunOption[] = recentRuns
    .map((run) => {
      const output = parseStoredDiscoveryOutput(run.outputData);
      if (!output || output.companyIds.length === 0) return null;
      return {
        id: run.id,
        title: run.title,
        // Classified here so the client never has to know the label strings, and
        // so the two groups in the menu cannot disagree with what created the run.
        kind: runKindFromTitle(run.title),
        // Formatted here, on the server. `formatDistanceToNow` reads the clock,
        // which in a component body trips `react-hooks/purity` and would also
        // hydrate to a different string than it rendered.
        when: formatDistanceToNow(run.createdAt, { addSuffix: true }),
        count: output.companyIds.length,
      };
    })
    // Runs that found nothing are left out on purpose: selecting one shows an
    // empty table, which is a dead end dressed up as an option.
    .filter((option): option is RunOption => option !== null)
    .slice(0, RUN_OPTIONS_SHOWN);

  return (
    <CompaniesClient
      companies={companies}
      totalItems={totalItems}
      totalPages={totalPages}
      currentPage={page}
      searchQueryParam={q}
      runFilter={runFilter}
      runOptions={runOptions}
    />
  );
}
