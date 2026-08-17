"use client";

import { useState, useTransition, useEffect } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, CompanyStatusBadge } from "@/components/ui/Badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Filter, Search, Globe, Users, ArrowRight, Trash2, Loader2, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteCompany, bulkDeleteCompanies } from "./actions";
import { useListState } from "@/hooks/useListState";

function ScoreDot({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#86868B] text-[13px]">—</span>;
  const color =
    score >= 80 ? "text-[#0071E3]" :
    score >= 65 ? "text-[#34C759]" :
    score >= 50 ? "text-[#FFCC00]" :
    "text-[#FF3B30]";
  return <span className={`text-[14px] font-semibold ${color}`}>{score}</span>;
}

interface CompaniesClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  companies: any[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  searchQueryParam: string;
}

export function CompaniesClient({ companies, totalItems, totalPages, currentPage, searchQueryParam }: CompaniesClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(searchQueryParam);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Debounced search pushing to URL
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery !== searchQueryParam) {
        startTransition(() => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("q", searchQuery);
          // Reset page to 1 when search changes
          router.push(`/companies?${params.toString()}`);
        });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchQueryParam, router]);

  const goToPage = (p: number) => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (p > 1) params.set("page", p.toString());
      router.push(`/companies?${params.toString()}`);
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
        subtitle={`${totalItems} companies tracked`}
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
                  const scoreObj = company.opportunities?.[0]?.score;
                  const mockScore = scoreObj ? scoreObj.overallScore : (company.status === "DISCOVERED" || company.status === "RESEARCHING" ? null : 70 + (company.name.length % 25));
                  const mockSignals = company._count?.signals ?? (company.status === "DISCOVERED" ? 0 : 1 + (company.name.length % 3));
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
                        <ScoreDot score={mockScore} />
                      </td>
                      <td className="text-center">
                        {mockSignals > 0 ? (
                          <Badge variant="info" className="px-1.5 py-0.5">{mockSignals}</Badge>
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
                      No companies found matching &quot;{searchQuery}&quot;
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
