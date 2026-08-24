import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { parseStoredAuditContent, parseBrandSnapshot } from "@/lib/ai/audit";
import { AuditDocument } from "@/components/audit/AuditDocument";

/**
 * The public audit.
 *
 * The one page in this app that is not behind the login gate, and it has to be:
 * the person it is written for is the agency's prospect, who has no account and
 * never will. `proxy.ts`'s matcher covers `/dashboard/*` and the auth pages only,
 * and this route sits outside the `(app)` group, so it inherits neither gate.
 *
 * What stands in for authentication is the share token — 32 random bytes, unique,
 * and the only thing looked up. Three rules follow from that and are load-bearing:
 *
 *   1. Only COMPLETED audits render. A queued, running or failed audit 404s,
 *      because `errorMessage` is written for the agency and can name the company
 *      or quote an internal failure.
 *   2. `noindex, nofollow`. A prospect finding their own audit through a Google
 *      search for their company would be the worst possible outcome for the
 *      agency that sent it. Robots headers are not access control, but this URL
 *      genuinely must never be crawled.
 *   3. Nothing from the live workspace is read. Everything visual comes from the
 *      frozen `brandSnapshot`, so this page cannot leak a workspace's current
 *      state and an audit sent months ago still looks the way it was sent.
 */

export const metadata: Metadata = {
  title: "Growth Audit",
  robots: { index: false, follow: false, nocache: true },
};

/** One counted view per token per half hour. */
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

export default async function PublicAuditPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  const audit = await prisma.growthAudit.findUnique({
    where: { shareToken },
    select: {
      id: true,
      status: true,
      headline: true,
      summary: true,
      sections: true,
      brandSnapshot: true,
      createdAt: true,
      completedAt: true,
      company: { select: { name: true, domain: true } },
    },
  });

  // Unfinished audits are indistinguishable from a wrong token on purpose:
  // a stranger holding a guessed token learns nothing either way.
  if (!audit || audit.status !== "COMPLETED") notFound();

  const content = parseStoredAuditContent(audit.sections);
  if (!content) notFound();

  // ── The view counter ─────────────────────────────────────────────────────
  // Runs after the response, so a slow or failed write costs the reader nothing.
  after(() => recordView(audit.id));

  return (
    <div className="min-h-screen bg-[#F5F5F7] px-4 py-10 print:bg-white print:p-0">
      <AuditDocument
        content={content}
        brand={parseBrandSnapshot(audit.brandSnapshot)}
        headline={audit.headline}
        summary={audit.summary}
        companyName={audit.company.name}
        companyDomain={audit.company.domain}
        generatedAt={audit.completedAt ?? audit.createdAt}
        chrome="public"
      />
    </div>
  );
}

/**
 * Count one view, at most once per half hour per audit.
 *
 * Deliberately a module-level function rather than an inline `after` callback.
 * `Date.now()` is impure, and `react-hooks/purity` rightly refuses it anywhere
 * inside a component body — it cannot see that this particular call happens after
 * the response has already been sent. Moving it out here satisfies the rule for
 * the real reason rather than silencing it, and the logic reads better alone.
 *
 * The whole update is one guarded statement rather than a read-then-write, so two
 * people opening the link at the same moment cannot both read the old count and
 * clobber each other.
 *
 * The guard also does the deduping: a prospect who refreshes four times while
 * reading is one view, which is what the agency actually wants to know. The cost
 * is that `lastViewedAt` records the last *counted* view, not the last load — an
 * acceptable trade for needing no extra table.
 */
async function recordView(auditId: string): Promise<void> {
  try {
    await prisma.growthAudit.updateMany({
      where: {
        id: auditId,
        OR: [
          { lastViewedAt: null },
          { lastViewedAt: { lt: new Date(Date.now() - VIEW_DEDUPE_MS) } },
        ],
      },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch (err) {
    // Never surfaced: a missed view count is not worth a broken page.
    console.error("Failed to record audit view:", err);
  }
}
