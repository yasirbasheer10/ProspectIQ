"use server";

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { sweepStaleRuns } from "@/lib/ai/stale-runs";
import { runGrowthAuditEngine, MONTHLY_AUDIT_LIMIT } from "@/lib/ai/audit";

/**
 * Reduce whatever was pasted to a bare hostname.
 *
 * Agencies paste "https://www.acme.co.uk/about?utm_source=x" as often as
 * "acme.co.uk", and the two must not become two different companies — `Company`
 * is unique on (workspaceId, domain), so a stray `www.` would silently create a
 * duplicate and audit it separately. Mirrors the cleanup in
 * `startDiscovery`'s custom-domain parsing.
 */
function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    // Reject anything without a dot: "localhost", "acme", a typed sentence.
    // Cheap, but it catches the paste that would otherwise cost a Jina fetch and
    // a model call before failing.
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * Kick off one Growth Audit and return the run to poll.
 *
 * Returns the *run* id rather than an audit id because the audit row cannot
 * exist yet: `GrowthAudit.companyId` is required, and the company is created by
 * the ingest step inside the engine. `checkAuditRunStatus` hands back the audit
 * id once there is one.
 */
export async function startGrowthAudit(payload: { url: string }) {
  const { workspaceId, userId } = await requireWorkspace();

  const domain = normalizeDomain(payload.url);
  if (!domain) {
    throw new Error("That does not look like a website address. Try something like acme.com.");
  }

  // ── Monthly quota ────────────────────────────────────────────────────────
  // Counts audits created this month regardless of outcome. Counting only
  // successes would let a workspace burn unlimited model calls on a site that
  // fails every time.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usedThisMonth = await prisma.growthAudit.count({
    where: { workspaceId, createdAt: { gte: startOfMonth } },
  });

  if (usedThisMonth >= MONTHLY_AUDIT_LIMIT) {
    throw new Error(
      `You have used all ${MONTHLY_AUDIT_LIMIT} growth audits for this month. The limit resets on the 1st.`
    );
  }

  // ── Double-click and duplicate guard ─────────────────────────────────────
  // Two clicks half a second apart would otherwise start two engines, and both
  // would ingest the same domain and write two audits. `inputParams.domain`
  // records what a run is for so an in-flight one can be found — the same
  // approach `researchCompany` uses for its companyId.
  //
  // Runs with no recent write are ignored: `sweepStaleRuns` is about to fail
  // them anyway, and treating a dead run as in-flight would lock the agency out
  // of re-auditing that domain.
  const inFlight = await prisma.agentRun.findFirst({
    where: {
      workspaceId,
      type: "GROWTH_AUDIT",
      status: { in: ["QUEUED", "RUNNING"] },
      inputParams: { path: ["domain"], equals: domain },
      updatedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (inFlight) {
    // Not an error: hand back the run already doing this work so the UI just
    // starts watching it. Clicking twice should feel like clicking once.
    return { success: true as const, runId: inFlight.id, alreadyRunning: true as const };
  }

  const agentRun = await prisma.agentRun.create({
    data: {
      workspaceId,
      userId,
      type: "GROWTH_AUDIT",
      status: "QUEUED",
      title: "Growth Audit",
      description: `Auditing ${domain}`,
      inputParams: { domain },
    },
    select: { id: true },
  });

  // Unawaited on purpose — the action must return before the UI can poll.
  // `runGrowthAuditEngine` handles all of its own errors and always drives the
  // run to a terminal status, so nothing here can leave a poll spinning.
  runGrowthAuditEngine({ domain, workspaceId, agentRunId: agentRun.id, userId }).catch(
    console.error
  );

  return { success: true as const, runId: agentRun.id, alreadyRunning: false as const };
}

/**
 * Poll one audit run.
 *
 * Sweeping stale runs here, rather than on a schedule, is the existing pattern
 * from `checkRunStatus`: the poll is the only thing guaranteed to be happening
 * while a run is in flight, so it is the one reliable place to notice a run that
 * a serverless timeout killed mid-generation.
 */
export async function checkAuditRunStatus(runId: string) {
  const { workspaceId } = await requireWorkspace();

  await sweepStaleRuns(workspaceId);

  // Scoped to the workspace, not `findUnique` by id: `errorMessage` quotes
  // company names and domains, so another workspace's run must not be readable.
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId },
    select: {
      status: true,
      errorMessage: true,
      growthAudit: { select: { id: true, shareToken: true, status: true } },
    },
  });

  if (!run) throw new Error("That audit run was not found in your workspace.");

  return {
    status: run.status,
    errorMessage: run.errorMessage,
    auditId: run.growthAudit?.id ?? null,
    shareToken: run.growthAudit?.shareToken ?? null,
  };
}

/**
 * Delete one audit.
 *
 * Deliberately a hard delete rather than an archive flag. The share link is
 * public to anyone holding the token, so "delete" has to actually revoke access
 * — an archived-but-readable audit would be a surprise the agency finds out
 * about from their prospect.
 */
export async function deleteGrowthAudit(auditId: string) {
  const { workspaceId } = await requireWorkspace();

  // deleteMany rather than delete: it scopes by workspace in the same statement,
  // so another workspace's audit id simply matches nothing instead of throwing
  // a not-found that confirms the id exists.
  const result = await prisma.growthAudit.deleteMany({ where: { id: auditId, workspaceId } });

  if (result.count === 0) throw new Error("That audit was not found in your workspace.");

  return { success: true as const };
}
