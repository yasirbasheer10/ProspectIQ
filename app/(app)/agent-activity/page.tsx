import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sweepStaleRuns } from "@/lib/ai/stale-runs";
import { formatDistanceToNow } from "date-fns";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Bot, Search, Zap, Target, Mail, Activity } from "lucide-react";
import { AgentActivityClient } from "./AgentActivityClient";

// Helper for icon matching
function getIconForActivityType(type: string) {
  if (type.includes("DISCOVER")) return "Search";
  if (type.includes("SIGNAL")) return "Zap";
  if (type.includes("OPPORTUNITY")) return "Target";
  if (type.includes("OUTREACH")) return "Mail";
  if (type.includes("ORCHESTRATOR")) return "Bot";
  return "Activity";
}

export default async function AgentActivityPage() {
  const session = await getSession();
  const workspaceId = session?.workspaceId || "demo";

  // Correct any run that died without writing a terminal status before we read
  // it — otherwise this page shows a permanent "Now Executing" card for a run
  // that was torn down hours ago, and the Start button stays disabled.
  await sweepStaleRuns(workspaceId);

  // Find the most recent orchestrator run
  const activeRun = await prisma.agentRun.findFirst({
    where: { 
      workspaceId,
      type: "ORCHESTRATOR"
    },
    orderBy: { createdAt: 'desc' }
  });

  const activities = await prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50 // limit for UI
  });

  // No demo-log fallback. This used to invent four activity entries — a company
  // called "Acme Commerce" and a person called "Sarah Jenkins" — whenever the
  // Activity table was empty, so a workspace that had never run the pipeline (or
  // one whose runs all failed) looked like it had been working. The client
  // already renders a proper "No recent actions." empty state for an empty array.
  const finalLogs = activities.map(act => ({
    id: act.id,
    action: act.type, // e.g. "COMPANY_DISCOVERED"
    details: act.description || (act.metadata ? JSON.stringify(act.metadata) : ""),
    time: formatDistanceToNow(new Date(act.createdAt), { addSuffix: true }),
    icon: getIconForActivityType(act.type)
  }));

  return <AgentActivityClient activeRun={activeRun} finalLogs={finalLogs} />;
}
