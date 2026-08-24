import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { parseStoredAuditContent, parseBrandSnapshot } from "@/lib/ai/audit";
import { AuditDocument } from "@/components/audit/AuditDocument";
import { Topbar } from "@/components/layout/Topbar";
import { AuditActions } from "./AuditActions";

export const metadata: Metadata = { title: "Growth Audit" };

/**
 * The agency's view of one audit.
 *
 * Shows exactly what the prospect will see, plus the share bar and the confidence
 * note. The document markup is not duplicated here — `AuditDocument` is the same
 * component the public page renders, which is the only way to be sure that
 * approving an audit here means approving what actually gets sent.
 */
export default async function AuditDetailPage({
  params,
}: {
  // A promise since Next 15, required in 16.
  params: Promise<{ id: string }>;
}) {
  const workspaceId = await requireWorkspaceId();
  const { id } = await params;

  // findFirst with the workspace in the where clause, not findUnique by id: an
  // audit quotes a company's own pages, so another workspace's id must miss.
  const audit = await prisma.growthAudit.findFirst({
    where: { id, workspaceId },
    select: {
      status: true,
      errorMessage: true,
      headline: true,
      summary: true,
      sections: true,
      brandSnapshot: true,
      shareToken: true,
      createdAt: true,
      completedAt: true,
      company: { select: { name: true, domain: true } },
    },
  });

  if (!audit) notFound();

  const shell = (children: React.ReactNode) => (
    <div className="flex h-full flex-col bg-[#F5F5F7]">
      <div className="print:hidden">
        <Topbar
          title={audit.company.name}
          subtitle="Growth Audit"
          actions={
            <Link
              href="/audits"
              className="inline-flex items-center gap-1.5 text-[13px] text-[#4B5563] hover:text-[#1D1D1F]"
            >
              <ArrowLeft size={14} />
              All audits
            </Link>
          }
        />
      </div>
      <main className="flex-1 overflow-y-auto p-8 print:overflow-visible print:p-0">
        {children}
      </main>
    </div>
  );

  // ── Still running ────────────────────────────────────────────────────────
  // Reachable by opening the link from another tab, or by refreshing before the
  // engine finishes. Not an error state, so it does not read like one.
  if (audit.status === "QUEUED" || audit.status === "RUNNING") {
    return shell(
      <div className="mx-auto max-w-3xl rounded-xl border border-[#E5E5EA] bg-white p-10 text-center">
        <Loader2 className="mx-auto animate-spin text-[#0071E3]" size={28} />
        <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
          Still writing this audit
        </p>
        <p className="mt-1.5 text-[13px] text-[#86868B]">
          Refresh in a minute. You can leave this page — it keeps going.
        </p>
      </div>
    );
  }

  const content = audit.status === "COMPLETED" ? parseStoredAuditContent(audit.sections) : null;

  // ── Failed, or stored in a shape this version cannot read ────────────────
  if (!content) {
    return shell(
      <div className="mx-auto max-w-3xl rounded-xl border border-[#E5E5EA] bg-white p-10 text-center">
        <XCircle className="mx-auto text-[#FF3B30]" size={28} />
        <p className="mt-4 text-[15px] font-semibold text-[#1D1D1F]">
          This audit could not be produced
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#86868B]">
          {audit.errorMessage ||
            "The saved audit could not be read. Generating a new one for this company should fix it."}
        </p>
        <div className="mt-6">
          <Link
            href="/audits"
            className="text-[13px] font-medium text-[#0071E3] hover:text-[#0077ED]"
          >
            Back to audits
          </Link>
        </div>
      </div>
    );
  }

  return shell(
    <>
      <div className="mx-auto max-w-3xl">
        <AuditActions shareToken={audit.shareToken} />
      </div>
      <AuditDocument
        content={content}
        brand={parseBrandSnapshot(audit.brandSnapshot)}
        headline={audit.headline}
        summary={audit.summary}
        companyName={audit.company.name}
        companyDomain={audit.company.domain}
        generatedAt={audit.completedAt ?? audit.createdAt}
        chrome="internal"
      />
    </>
  );
}
