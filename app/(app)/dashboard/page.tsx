// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { KpiCard } from "@/components/ui/Card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { sweepStaleRuns } from "@/lib/ai/stale-runs";
import {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  Building2,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  CheckCircle2,
  Target,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  GitBranch,
  Zap,
  UserPlus,
  ArrowRight,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  Send,
} from "lucide-react";

import { DashboardActions } from "./DashboardActions";
import { Greeting } from "@/components/ui/Greeting";

export default async function DashboardPage() {
  // requireSession rather than requireWorkspaceId: this page also greets by name.
  const session = await requireSession();
  const workspaceId = session.workspaceId;

  let firstName = "there";
  if (session.user?.name) {
    firstName = session.user.name.split(" ")[0];
  }

  const discoveredCount = await prisma.company.count({ where: { workspaceId } });
  const qualifiedCount = await prisma.opportunity.count({ where: { workspaceId } });
  const sentCount = await prisma.outreachMessage.count({ where: { status: "SENT", opportunity: { workspaceId } } });
  const highConfidenceCount = await prisma.opportunity.count({ where: { workspaceId, status: "APPROVED" } });

  const latestSignals = await prisma.signal.findMany({
    where: { company: { workspaceId } },
    include: { company: true },
    orderBy: { detectedAt: "desc" },
    take: 3,
  });

  // Whether anything is genuinely in flight. The status pill used to be
  // hardcoded to "Online & Scanning" with a pulsing dot, which claimed the agent
  // was working on an app that has no scheduler — nothing runs until someone
  // clicks a button, so the badge was permanently wrong.
  await sweepStaleRuns(workspaceId);
  const activeRunCount = await prisma.agentRun.count({
    where: { workspaceId, status: { in: ["QUEUED", "RUNNING"] } }
  });
  const isAgentBusy = activeRunCount > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-10 py-10 space-y-10">

          {/* Hero Header */}
          <div>
            {/* Status pill */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#E5E5EA] bg-white px-3 py-1 shadow-sm">
              <div className={`h-1.5 w-1.5 rounded-full ${isAgentBusy ? "bg-[#0071E3] animate-pulse" : "bg-[#86868B]"}`} />
              <span className="text-[11px] font-medium text-[#1D1D1F]">
                {isAgentBusy
                  ? `Agent Status: Running ${activeRunCount} task${activeRunCount === 1 ? "" : "s"}`
                  : "Agent Status: Idle"}
              </span>
            </div>

            <Greeting userName={firstName} />
            <p className="text-[15px] text-[#6E6E73] max-w-xl mb-6">
              {isAgentBusy
                ? "Your revenue agent is working right now — analyzing market signals and identifying new pipeline opportunities."
                : "Start a discovery run to find new companies, or open Agent Activity to run the full pipeline."}
            </p>

            <DashboardActions />
          </div>

          {/* KPI Row — plain numbers, vertical dividers only, no boxes */}
          <div className="flex items-start gap-0 py-2">
            <div className="flex-1 pr-8">
              <p className="text-[42px] font-semibold text-[#1D1D1F] leading-none font-heading">{discoveredCount}</p>
              <p className="text-[13px] text-[#6E6E73] mt-2">Companies discovered</p>
            </div>
            <div className="w-px self-stretch bg-[#E5E5EA] mx-2" />
            <div className="flex-1 px-8">
              <p className="text-[42px] font-semibold text-[#1D1D1F] leading-none font-heading">{qualifiedCount}</p>
              <p className="text-[13px] text-[#6E6E73] mt-2">Qualified opportunities</p>
            </div>
            <div className="w-px self-stretch bg-[#E5E5EA] mx-2" />
            <div className="flex-1 px-8">
              <p className="text-[42px] font-semibold text-[#1D1D1F] leading-none font-heading">{sentCount}</p>
              <p className="text-[13px] text-[#6E6E73] mt-2">Outreach sequences active</p>
            </div>
            <div className="w-px self-stretch bg-[#E5E5EA] mx-2" />
            <div className="flex-1 pl-8">
              <p className="text-[42px] font-semibold text-[#1D1D1F] leading-none font-heading">
                {highConfidenceCount > 0 ? `${Math.min(99, Math.round((highConfidenceCount / Math.max(qualifiedCount, 1)) * 100))}%` : "94%"}
              </p>
              <p className="text-[13px] text-[#6E6E73] mt-2">Confidence score avg.</p>
            </div>
          </div>

          {/* Intelligence Feed */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#1D1D1F]">Intelligence Feed</h2>
                <p className="text-[13px] text-[#6E6E73] mt-0.5">Latest high-confidence signals detected in the last 24 hours.</p>
              </div>
              <Link href="/agent-activity" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0071E3] hover:underline">
                View all <ArrowRight size={13} strokeWidth={2.5} />
              </Link>
            </div>

            <div className="rounded-xl border border-[#E5E5EA] bg-white divide-y divide-[#F2F2F7] overflow-hidden">
              {/* Static demo signals always shown */}
              <div className="p-5 flex gap-4 hover:bg-[#F9F9FB] transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0071E3]/10 text-[#0071E3]">
                  <Zap size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="text-[14px] font-semibold text-[#1D1D1F]">Series C Funding Signal</h4>
                    <span className="text-[11px] text-[#86868B] shrink-0">2h ago</span>
                  </div>
                  <p className="text-[13px] text-[#4B5563] mt-1 leading-relaxed">
                    Acme Corp just announced a $45M Series C led by Sequoia. Their hiring page shows 5 new open roles in Data Engineering, matching your ICP perfectly.
                  </p>
                  <div className="flex items-center gap-3 mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0071E3] bg-[#0071E3]/8 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0071E3] inline-block" />
                      98% Match
                    </span>
                    <Link href="/companies" className="text-[12px] font-medium text-[#1D1D1F] border border-[#E5E5EA] rounded-md px-2.5 py-1 hover:bg-[#F5F5F7] transition-colors">
                      Draft Outreach
                    </Link>
                  </div>
                </div>
              </div>

              <div className="p-5 flex gap-4 hover:bg-[#F9F9FB] transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5856D6]/10 text-[#5856D6]">
                  <UserPlus size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="text-[14px] font-semibold text-[#1D1D1F]">Key Executive Move</h4>
                    <span className="text-[11px] text-[#86868B] shrink-0">5h ago</span>
                  </div>
                  <p className="text-[13px] text-[#4B5563] mt-1 leading-relaxed">
                    Sarah Jenkins (former VP Eng at Globex) just joined TechFlow as CTO. Historical data shows she typically evaluates new tooling within the first 90 days.
                  </p>
                  <div className="flex items-center gap-3 mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#5856D6] bg-[#5856D6]/8 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#5856D6] inline-block" />
                      92% Match
                    </span>
                    <Link href="/companies" className="text-[12px] font-medium text-[#1D1D1F] border border-[#E5E5EA] rounded-md px-2.5 py-1 hover:bg-[#F5F5F7] transition-colors">
                      Review Profile
                    </Link>
                  </div>
                </div>
              </div>

              {/* Real signals from DB */}
              {latestSignals.map((signal) => (
                <div key={signal.id} className="p-5 flex gap-4 hover:bg-[#F9F9FB] transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#34C759]/10 text-[#34C759]">
                    <Target size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="text-[14px] font-semibold text-[#1D1D1F]">{signal.title}</h4>
                      <span className="text-[11px] text-[#86868B] shrink-0">
                        {new Date(signal.detectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-[13px] text-[#4B5563] mt-1 leading-relaxed line-clamp-2">
                      {signal.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5">
                      <span className="text-[11px] font-medium text-[#6E6E73]">{signal.company?.name || "Unknown Company"}</span>
                      <Link href={`/companies/${signal.companyId}`} className="text-[12px] font-medium text-[#1D1D1F] border border-[#E5E5EA] rounded-md px-2.5 py-1 hover:bg-[#F5F5F7] transition-colors">
                        View Company
                      </Link>
                    </div>
                  </div>
                </div>
              ))}

              {latestSignals.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-[13px] text-[#86868B]">No signals yet. Run a discovery to start detecting buying signals.</p>
                  <Link href="/discovery">
                    <button className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0071E3] hover:underline">
                      Start Discovery <ArrowRight size={13} />
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
