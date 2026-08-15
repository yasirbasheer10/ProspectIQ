"use client";

import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Bot, GitBranch, Play, Square, Activity, Database, Users, Mail } from "lucide-react";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { formatDistanceToNow } from "date-fns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgentFleetClient({ agents }: { agents: any[] }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Agent Fleet" />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-5xl space-y-8">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#1D1D1F] text-white shadow-sm">
                <GitBranch size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Agent Fleet</h1>
                <p className="text-[14px] text-[#86868B] mt-0.5">Manage and monitor your specialized AI agents.</p>
              </div>
            </div>
            <Link href="/deploy">
              <Button variant="primary" className="flex items-center gap-2">
                <Bot size={16} />
                Deploy New Agent
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <Card key={agent.id} className="border-[#E5E5EA] overflow-hidden flex flex-col hover:border-[#D1D1D6] transition-colors">
                <div className="p-5 border-b border-[#E5E5EA] bg-white flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${agent.isActive ? 'bg-[#EFFFEC] text-[#34C759]' : 'bg-[#F5F5F7] text-[#86868B]'}`}>
                      <Bot size={20} />
                    </div>
                    <div>
                      <Link href={`/agents/${agent.id}`}>
                        <h3 className="text-[15px] font-semibold text-[#1D1D1F] hover:text-[#0071E3] transition-colors">{agent.name}</h3>
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${agent.isActive ? 'bg-[#34C759]' : 'bg-[#86868B]'}`} />
                        <span className="text-[12px] text-[#86868B]">{agent.isActive ? "Online" : "Offline"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 bg-[#F9F9FB] flex-1">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[12px] font-medium text-[#86868B] uppercase tracking-wider mb-2">Primary Goal</p>
                      <p className="text-[13px] text-[#1D1D1F] line-clamp-2">{agent.goal || "Autonomous Lead Generation"}</p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[#E5E5EA]">
                      <div className="text-center">
                        <div className="flex justify-center text-[#86868B] mb-1"><Database size={14} /></div>
                        <p className="text-[15px] font-semibold text-[#1D1D1F]">{agent._count.companies}</p>
                        <p className="text-[10px] text-[#86868B] uppercase">Companies</p>
                      </div>
                      <div className="text-center">
                        <div className="flex justify-center text-[#86868B] mb-1"><Users size={14} /></div>
                        <p className="text-[15px] font-semibold text-[#1D1D1F]">{agent._count.contacts}</p>
                        <p className="text-[10px] text-[#86868B] uppercase">Contacts</p>
                      </div>
                      <div className="text-center">
                        <div className="flex justify-center text-[#86868B] mb-1"><Mail size={14} /></div>
                        <p className="text-[15px] font-semibold text-[#1D1D1F]">{agent._count.outreachMessages}</p>
                        <p className="text-[10px] text-[#86868B] uppercase">Drafts</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border-t border-[#E5E5EA] flex gap-2">
                  <Link href={`/agents/${agent.id}`} className="flex-1">
                    <Button variant="primary" className="w-full text-[13px]">View Progress</Button>
                  </Link>
                  <Link href={`/agents/${agent.id}/settings`} className="flex-1">
                    <Button variant="secondary" className="w-full text-[13px]">Configure</Button>
                  </Link>
                </div>
              </Card>
            ))}

            {agents.length === 0 && (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-[#E5E5EA] rounded-[16px] bg-[#F9F9FB]">
                <Bot size={48} className="text-[#D1D1D6] mb-4" />
                <h3 className="text-[16px] font-semibold text-[#1D1D1F] mb-2">No Custom Agents Deployed</h3>
                <p className="text-[14px] text-[#86868B] max-w-md mb-6">Deploy specialized agents to hunt for specific criteria, scrape targets, and draft tailored outreach automatically.</p>
                <Link href="/deploy">
                  <Button variant="primary">Deploy First Agent</Button>
                </Link>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
