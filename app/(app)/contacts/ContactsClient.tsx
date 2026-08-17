"use client";

import { useState, useTransition, useEffect } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Filter, Search, Link2, Mail, ExternalLink, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteContactAction, deleteBulkContactsAction } from "./actions";
import { useListState } from "@/hooks/useListState";

interface ContactsClientProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  contacts: any[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  searchQueryParam: string;
}

export function ContactsClient({ contacts, totalItems, totalPages, currentPage, searchQueryParam }: ContactsClientProps) {
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
  } = useListState(contacts);

  // Debounced search pushing to URL
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery !== searchQueryParam) {
        startTransition(() => {
          const params = new URLSearchParams();
          if (searchQuery) params.set("q", searchQuery);
          router.push(`/contacts?${params.toString()}`);
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
      router.push(`/contacts?${params.toString()}`);
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this contact?")) {
      setDeletingId(id);
      startTransition(async () => {
        await deleteContactAction(id);
        removeDeletedId(id);
        setDeletingId(null);
        router.refresh();
      });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) {
      setIsBulkDeleting(true);
      startTransition(async () => {
        await deleteBulkContactsAction(Array.from(selectedIds));
        clearSelection();
        setIsBulkDeleting(false);
        router.refresh();
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Contacts" subtitle={`${totalItems} contacts identified`}
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                icon={isBulkDeleting ? Loader2 : Trash2} 
                className="text-[#FF3B30] bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20"
                onClick={handleBulkDelete}
                disabled={isPending || isBulkDeleting}
              >
                {isBulkDeleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={Filter}>Filter</Button>
          </div>
        } 
      />
      
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-6xl flex flex-col min-h-full">
          <div className="mb-6 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868B]" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts by name, company, or email..." 
              className="w-full rounded-xl border border-[#E5E5EA] bg-white py-3 pl-10 pr-4 text-[14px] text-[#1D1D1F] placeholder-[#86868B] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] shadow-sm transition-all"
            />
          </div>
          
          <Card className="overflow-hidden mb-4 flex-1">
            <table className="data-table w-full text-left">
              <thead className="bg-[#F5F5F7]">
                <tr>
                  <th className="w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-[#E5E5EA] text-[#0071E3] focus:ring-[#0071E3]"
                      checked={contacts.length > 0 && selectedIds.size === contacts.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Contact</th>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th className="text-center">Buyer Score</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {contacts.length > 0 ? contacts.map((c) => {
                  const isVerified = c.buyerScore > 85; // Mock verification logic based on score
                  const fullName = c.fullName || c.name || `${c.firstName} ${c.lastName}`;
                  const isDeleting = deletingId === c.id;
                  
                  return (
                    <tr key={c.id} className={`group hover:bg-[#F9F9FB] transition-colors ${isDeleting ? "opacity-50" : ""} ${selectedIds.has(c.id) ? "bg-[#0071E3]/5" : ""}`}>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="rounded border-[#E5E5EA] text-[#0071E3] focus:ring-[#0071E3]"
                          checked={selectedIds.has(c.id)}
                          onChange={(e) => toggleSelectRow(e, c.id)}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E5E5EA] text-[13px] font-semibold text-[#4B5563]">
                            {c.initials || fullName[0]}
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-[#1D1D1F]">{fullName}</p>
                            <div className="mt-0.5">
                              <Badge variant="outline" size="sm" className="px-1.5 py-0 text-[10px]">{c.seniority || "Unknown"}</Badge>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><span className="text-[13px] text-[#4B5563]">{c.title}</span></td>
                      <td><span className="text-[13px] text-[#4B5563]">{c.company?.name || '—'}</span></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-[#4B5563]">{c.email}</span>
                          {isVerified ? (
                            <Badge variant="success" size="sm" className="px-1.5 py-0 text-[10px]">Verified</Badge>
                          ) : (
                            <Badge variant="warning" size="sm" className="px-1.5 py-0 text-[10px]">Unverified</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`text-[14px] font-semibold ${c.buyerScore >= 90 ? 'text-[#0071E3]' : c.buyerScore >= 80 ? 'text-[#34C759]' : 'text-[#FF9500]'}`}>
                          {c.buyerScore}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={`mailto:${c.email}`}>
                            <Button variant="ghost" size="sm" icon={Mail} className="text-[#0071E3]">Email</Button>
                          </a>
                          {c.linkedinUrl && (
                            <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm" icon={Link2} className="text-[#4B5563]" />
                            </a>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            icon={isDeleting ? Loader2 : Trash2} 
                            className="text-[#FF3B30] hover:bg-[#FF3B30]/10" 
                            onClick={() => handleDelete(c.id)}
                            disabled={isDeleting || isPending}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-[#86868B]">
                      No contacts found matching &quot;{searchQuery}&quot;
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
