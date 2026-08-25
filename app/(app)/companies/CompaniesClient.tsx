"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, CompanyStatusBadge } from "@/components/ui/Badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Filter, Search, Globe, Users, ArrowRight, Trash2, Loader2, CheckSquare, ChevronLeft, ChevronRight, Target, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteCompany, bulkDeleteCompanies } from "./actions";
import { useListState } from "@/hooks/useListState";
import { getScoreColor } from "@/lib/scoring/opportunity-score";

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#86868B] text-[13px]">—</span>;
  // Was a second copy of the score-to-colour ladder, on thresholds that
  // disagreed with the grades. One definition, in the scoring module.
  return <span className={`text-[14px] font-semibold ${getScoreColor(score)}`}>{score}</span>;
}

/**
 * The three ways "show me only this run's results" can turn out.
 *
 * Split rather than collapsed into one nullable shape because each needs a
 * different sentence, and merging them would mean showing "0 companies" for two
 * situations that are not that: a run whose results were never recorded, and a
 * run id that does not belong to this workspace.
 */
export type RunFilterView =
  | {
      kind: "tracked";
      id: string;
      title: string;
      /** Sites the run set out to read, failures included. */
      requestedDomains: number;
    }
  /** Finished before results were recorded — its companies can't be isolated. */
  | { kind: "untracked"; id: string; title: string }
  /** No such run in this workspace. Usually a stale or hand-edited link. */
  | { kind: "missing"; id: string };

/**
 * The bar that explains why this list is shorter than the workspace's.
 *
 * It always offers a way out, including in the two failure shapes — a filter you
 * cannot see the reason for and cannot clear is worse than no filter.
 */
function RunFilterBanner({ filter, shown }: { filter: RunFilterView; shown: number }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#0071E3]/20 bg-[#EBF3FF] px-4 py-3.5">
      <Target size={16} className="mt-0.5 shrink-0 text-[#0071E3]" />

      <div className="min-w-0 flex-1">
        {filter.kind === "tracked" && (
          <>
            <p className="text-[13px] font-medium text-[#1D1D1F]">
              Showing {shown} {shown === 1 ? "company" : "companies"} from {filter.title}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#4B5563]">
              {/* Both numbers on purpose. Some sites block scrapers or time out, so
                  the list is normally shorter than the number of matches found —
                  without the second number that looks like results went missing. */}
              {filter.requestedDomains} matching {filter.requestedDomains === 1 ? "website was" : "websites were"} read.
              {shown < filter.requestedDomains && " The rest could not be read, or have since been deleted."}
            </p>
          </>
        )}

        {filter.kind === "untracked" && (
          <>
            <p className="text-[13px] font-medium text-[#1D1D1F]">
              {filter.title} did not record which companies it found
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#4B5563]">
              It ran before results were tracked. Its companies are still in your
              list — they just can&apos;t be separated out any more.
            </p>
          </>
        )}

        {filter.kind === "missing" && (
          <>
            <p className="text-[13px] font-medium text-[#1D1D1F]">That search could not be found</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[#4B5563]">
              The link may be out of date, or the run may have been deleted.
            </p>
          </>
        )}
      </div>

      <Link
        href="/companies"
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#0071E3] transition-colors hover:bg-white/70"
      >
        <X size={13} />
        Show all
      </Link>
    </div>
  );
}

interface CompaniesClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  companies: any[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  searchQueryParam: string;
  runFilter: RunFilterView | null;
}

export function CompaniesClient({ companies, totalItems, totalPages, currentPage, searchQueryParam, runFilter }: CompaniesClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(searchQueryParam);
  const [isPending, startTransition] = useTransition();

  const {
    selectedIds,
    isBulkDeleting,
    setIsBulkDeleting,
    deletingId,
    setDeletingId,
    toggleSelectAll,
    toggleSelectRow,
    clearSelection,
    removeDeletedId,
  } = useListState(companies);

  /**
   * The one place that builds this page's query string.
   *
   * Both callers used to construct a fresh `URLSearchParams` from just the values
   * they cared about, which silently dropped everything else — so with a run
   * filter active, typing in the search box or turning the page would have thrown
   * the filter away and dumped the user back into the full list.
   *
   * Keyed on `runId` rather than the `runFilter` object: the object arrives as a
   * prop from a server render, so its identity changes on every refresh, and
   * depending on it would restart the debounce timer below on each one.
   */
  const runId = runFilter?.id ?? null;

  const buildQuery = useCallback(
    (overrides: { page?: number }) => {
      const params = new URLSearchParams();
      const nextPage = overrides.page ?? 1;

      if (searchQuery) params.set("q", searchQuery);
      if (nextPage > 1) params.set("page", nextPage.toString());
      if (runId) params.set("run", runId);

      const qs = params.toString();
      return qs ? `/companies?${qs}` : "/companies";
    },
    [searchQuery, runId]
  );

  // Debounced search pushing to URL
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery !== searchQueryParam) {
        startTransition(() => {
          // Page deliberately omitted, i.e. back to 1: a new search has no reason
          // to keep the old page number.
          router.push(buildQuery({}));
        });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchQueryParam, router, buildQuery]);

  const goToPage = (p: number) => {
    startTransition(() => {
      router.push(buildQuery({ page: p }));
    });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // prevent row click
    if (!confirm("Are you sure you want to delete this company?")) return;
    
    setDeletingId(id);
    startTransition(async () => {
      await deleteCompany(id);
      setDeletingId(null);
      removeDeletedId(id);
      router.refresh();
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} selected companies?`)) return;
    
    setIsBulkDeleting(true);
    startTransition(async () => {
      await bulkDeleteCompanies(Array.from(selectedIds));
      clearSelection();
      setIsBulkDeleting(false);
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar
        title="Companies"
        subtitle={
          // "N companies tracked" would be a lie while a run filter is on — N is
          // then this search's results, not the workspace's list.
          runFilter
            ? `${totalItems} from one search`
            : `${totalItems} companies tracked`
        }
        actions={
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={isBulkDeleting ? Loader2 : Trash2}
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="text-[#FF3B30] hover:text-[#FF3B30] border-[#FF3B30]/20 bg-[#FF3B30]/5 hover:bg-[#FF3B30]/10"
              >
                {isBulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} Selected`}
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={Filter}>Filter</Button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-6xl flex flex-col min-h-full">
          {runFilter && <RunFilterBanner filter={runFilter} shown={totalItems} />}

          {/* Search bar */}
          <div className="mb-6 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
            <input
              type="text"
              placeholder="Search companies by name, domain, or industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#E5E5EA] bg-white py-3 pl-10 pr-4 text-[14px] text-[#1D1D1F] placeholder-[#86868B] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] shadow-sm transition-all"
            />
          </div>

          {/* Table */}
          <Card className="overflow-hidden mb-4 flex-1">
            <table className="data-table w-full text-left">
              <thead className="bg-[#F5F5F7]">
                <tr>
                  <th className="w-12 pl-4">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-[#E5E5EA] text-[#0071E3] focus:ring-[#0071E3] cursor-pointer"
                      checked={companies.length > 0 && selectedIds.size === companies.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Size</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th className="text-center">Score</th>
                  <th className="text-center">Signals</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {companies.length > 0 ? companies.map((company) => {
                  // Both of these used to fall back to arithmetic on the
                  // company's *name length* — `70 + (name.length % 25)` for the
                  // score and `1 + (name.length % 3)` for the signal count — so
                  // an unresearched company displayed a confident-looking 70-94
                  // and a signal badge, neither of which existed. A company with
                  // no score shows no score.
                  const score = company.opportunities?.[0]?.score?.overallScore ?? null;
                  const signalCount = company._count?.signals ?? 0;
                  const isDeleting = deletingId === company.id;
                  const isSelected = selectedIds.has(company.id);

                  return (
                    <tr 
                      key={company.id} 
                      className={`group cursor-pointer hover:bg-[#F9F9FB] transition-colors ${isDeleting ? "opacity-50" : ""} ${isSelected ? "bg-[#0071E3]/5" : ""}`}
                      onClick={() => !isDeleting && router.push(`/companies/${company.id}`)}
                    >
                      <td className="w-12 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded border-[#E5E5EA] text-[#0071E3] focus:ring-[#0071E3] cursor-pointer"
                          checked={isSelected}
                          onChange={(e) => toggleSelectRow(e, company.id)}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#F5F5F7] border border-[#E5E5EA] text-[13px] font-semibold text-[#4B5563]">
                            {company.name[0]}
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors">{company.name}</p>
                            <p className="text-[12px] text-[#86868B]">{company.domain}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-[13px] text-[#4B5563]">{company.industry || '—'}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Users size={13} className="text-[#86868B]" />
                          <span className="text-[13px] text-[#4B5563]">{company.employeeRange || '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Globe size={13} className="text-[#86868B]" />
                          <span className="text-[13px] text-[#4B5563]">{company.country || '—'}</span>
                        </div>
                      </td>
                      <td>
                        <CompanyStatusBadge status={company.status} />
                      </td>
                      <td className="text-center">
                        <ScoreDot score={score} />
                      </td>
                      <td className="text-center">
                        {signalCount > 0 ? (
                          <Badge variant="info" className="px-1.5 py-0.5">{signalCount}</Badge>
                        ) : (
                          <span className="text-[#86868B] text-[13px]">—</span>
                        )}
                      </td>
                      <td className="text-right flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleDelete(e, company.id)}
                          className="p-2 text-[#86868B] hover:text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-[#FF3B30]/10"
                          title="Delete Company"
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                        <Button variant="ghost" size="sm" icon={ArrowRight} className="text-[#0071E3] opacity-0 group-hover:opacity-100 transition-opacity">
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-[#86868B]">
                      {/* Three different empty lists, and blaming the search box
                          for all of them sent people looking in the wrong place. */}
                      {runFilter ? (
                        searchQuery
                          ? <>No companies in this search match &quot;{searchQuery}&quot;.</>
                          : <>This search did not return any companies.</>
                      ) : searchQuery ? (
                        <>No companies found matching &quot;{searchQuery}&quot;.</>
                      ) : (
                        <>No companies yet. Run a discovery or a lookalike search to fill this in.</>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pb-8">
              <span className="text-[14px] text-[#86868B]">
                Showing {((currentPage - 1) * 50) + 1} - {Math.min(currentPage * 50, totalItems)} of {totalItems}
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  icon={ChevronLeft} 
                  disabled={currentPage === 1 || isPending}
                  onClick={() => goToPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <div className="text-[14px] font-medium text-[#1D1D1F] px-2">
                  Page {currentPage} of {totalPages}
                </div>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  disabled={currentPage === totalPages || isPending}
                  onClick={() => goToPage(currentPage + 1)}
                >
                  Next <ChevronRight size={16} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
