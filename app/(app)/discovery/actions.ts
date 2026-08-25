"use server";

import { prisma } from "@/lib/db";
import { requireWorkspaceId } from "@/lib/session";
import { runDiscoveryEngine } from "@/lib/ai/discovery";
import { sweepStaleRuns } from "@/lib/ai/stale-runs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redirect } from "next/navigation";

export async function startDiscovery(payload: {
  customDomains?: string;
  /**
   * How companies this run adds for the first time should be labelled. Defaults
   * to a plain discovery run; the lookalike search passes `"lookalike"`.
   *
   * Not read from the browser for anything but this label — it never widens what
   * the run is allowed to do, so an edited value can only mislabel a row in the
   * caller's own workspace.
   */
  source?: string;
  icpParams?: {
    countries: Record<string, string[]>;
    industries: string[];
    size: string | null;
    keywords?: string[];
    excludeKeywords?: string[];
  }
}) {
  const workspaceId = await requireWorkspaceId();

  // 1. Enforce Budget Limit
  const agent = await prisma.customAgent.findFirst({
    where: { workspaceId, isActive: true }
  });
  const budgetLimit = agent?.budgetLimit || 100;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usageCount = await prisma.company.count({
    where: { 
      workspaceId,
      createdAt: { gte: startOfMonth }
    }
  });

  if (usageCount >= budgetLimit) {
    throw new Error(`Budget Limit Exceeded: Your active agent has reached its limit of ${budgetLimit} discovered targets this month.`);
  }

  // Parse custom domains if any
  let customDomains: string[] = [];
  if (payload.customDomains && payload.customDomains.trim().length > 0) {
    customDomains = payload.customDomains
      .split(/[\n,]/)
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0)
      .map(d => {
        // basic domain cleanup
        try {
          const url = new URL(d.startsWith('http') ? d : `https://${d}`);
          return url.hostname.replace(/^www\./, '');
        } catch {
          return d;
        }
      });
  }

  // Check if this manual import exceeds the budget immediately
  if (customDomains.length > 0 && (usageCount + customDomains.length) > budgetLimit) {
    throw new Error(`Budget Limit Exceeded: Importing ${customDomains.length} domains would exceed your monthly limit of ${budgetLimit}.`);
  }

  // Create AgentRun
  const agentRun = await prisma.agentRun.create({
    data: {
      workspaceId,
      type: "DISCOVERY",
      status: "QUEUED",
      // Named so the Companies page can say which search a filtered list came
      // from without having to know why the run was started.
      title: payload.source === "lookalike" ? "Lookalike Search" : "Company Discovery Run",
      description: customDomains.length > 0
        ? `Manual import of ${customDomains.length} domain(s)`
        : "Public web research based on ICP",
    }
  });

  // Kick off the background process.
  // We do not await this, so it runs in the background.
  runDiscoveryEngine({
    workspaceId,
    agentRunId: agentRun.id,
    customDomains,
    source: payload.source,
    icpParams: payload.icpParams
  }).catch(console.error);

  // Return success
  return { success: true, runId: agentRun.id };
}

export async function checkRunStatus(runId: string) {
  const workspaceId = await requireWorkspaceId();

  // This is the endpoint the UI polls while a run is in progress, so it's the
  // right place to notice a run that has stopped making progress. Without this
  // a run killed mid-execution stays QUEUED/RUNNING forever and the client
  // polls a spinner indefinitely.
  await sweepStaleRuns(workspaceId);

  // `findUnique({ where: { id: runId } })` here would return any workspace's
  // run — including its `errorMessage`, which quotes company names.
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId }
  });

  if (!run) throw new Error("That run was not found in your workspace.");

  return { status: run.status, errorMessage: run.errorMessage };
}
