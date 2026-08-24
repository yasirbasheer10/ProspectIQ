import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { MONTHLY_AUDIT_LIMIT } from "@/lib/ai/audit";
import { AuditsClient, type AuditListRow } from "./AuditsClient";

export const metadata: Metadata = { title: "Growth Audits" };

/**
 * The audits list.
 *
 * Queries Prisma directly and hands a plain array to the client component, which
 * is the convention every other page here follows — there is no REST layer for
 * app data.
 */
export default async function AuditsPage() {
  const workspaceId = await requireWorkspaceId();

  // Same month boundary `startGrowthAudit` uses. Computed in both places rather
  // than shared, because the action must not trust a number the browser sends
  // and this one is only ever for display.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [rows, usedThisMonth] = await Promise.all([
    prisma.growthAudit.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        headline: true,
        auditScore: true,
        auditGrade: true,
        viewCount: true,
        shareToken: true,
        createdAt: true,
        // `sections` is deliberately not selected: it is the largest column in
        // the table and the list shows none of it.
        company: { select: { name: true, domain: true } },
      },
    }),
    prisma.growthAudit.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } }),
  ]);

  const audits: AuditListRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    headline: r.headline,
    auditScore: r.auditScore,
    auditGrade: r.auditGrade,
    viewCount: r.viewCount,
    shareToken: r.shareToken,
    createdAt: r.createdAt,
    companyName: r.company.name,
    companyDomain: r.company.domain,
  }));

  return (
    <AuditsClient
      audits={audits}
      usedThisMonth={usedThisMonth}
      monthlyLimit={MONTHLY_AUDIT_LIMIT}
    />
  );
}
