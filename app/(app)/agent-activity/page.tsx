import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
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

  // Fallback demo logs if no DB data
  const finalLogs = activities.length > 0 
    ? activities.map(act => ({
        id: act.id,
        action: act.type, // e.g. "COMPANY_DISCOVERED"
        details: act.description || (act.metadata ? JSON.stringify(act.metadata) : ""),
        time: formatDistanceToNow(new Date(act.createdAt), { addSuffix: true }),
        icon: getIconForActivityType(act.type)
      }))
    : [
      { id: "1", action: "Discovered Company", details: "Acme Commerce matches E-commerce ICP.", time: "10m ago", icon: "Search" },
      { id: "2", action: "Analyzed Signals", details: "Found checkout redesign signal for Acme Commerce.", time: "15m ago", icon: "Zap" },
      { id: "3", action: "Generated Opportunity", title: "Acme Commerce - CRO", details: "Scored 92/100 based on recent signals.", time: "16m ago", icon: "Target" },
      { id: "4", action: "Drafted Outreach", details: "Prepared email for Sarah Jenkins (VP E-commerce).", time: "17m ago", icon: "Mail" },
    ];

  return <AgentActivityClient activeRun={activeRun} finalLogs={finalLogs} />;
}
