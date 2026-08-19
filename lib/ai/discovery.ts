"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { runDiscoveryEngine } from "@/lib/ai/discovery";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redirect } from "next/navigation";

export async function startDiscovery(payload: {
  customDomains?: string;
  icpParams?: {
    countries: Record<string, string[]>;
    industries: string[];
    size: string | null;
    keywords?: string[];
    excludeKeywords?: string[];
  }
}) {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in to start discovery.");
  }
  const workspaceId = session.workspaceId;
  if (!workspaceId) throw new Error("Workspace missing");

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
      title: "Company Discovery Run",
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
    icpParams: payload.icpParams
  }).catch(console.error);

  // Return success
  return { success: true, runId: agentRun.id };
}

export async function checkRunStatus(runId: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  
  const run = await prisma.agentRun.findUnique({
    where: { id: runId }
  });
  return { status: run?.status };
}
