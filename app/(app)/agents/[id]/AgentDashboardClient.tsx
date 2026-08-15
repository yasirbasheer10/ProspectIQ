"use client";

import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Bot, ArrowLeft, Database, Users, Mail, Settings2, Play, Square, Activity } from "lucide-react";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAgentStatus } from "./actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgentDashboardClient({ agent }: { agent: any }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleToggle = () => {
    startTransition(async () => {
      await toggleAgentStatus(agent.id, !agent.isActive);
      router.refresh();
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title={`${agent.name} Dashboard`} />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-6xl space-y-8">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/agents" className="h-10 w-10 rounded-full hover:bg-[#E5E5EA] flex items-center justify-center text-[#86868B] transition-colors">
                <ArrowLeft size={20} />
              </Link>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-[12px] shadow-sm ${agent.isActive ? 'bg-[#1D1D1F] text-white' : 'bg-white border border-[#E5E5EA] text-[#86868B]'}`}>
                  <Bot size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">{agent.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`h-2 w-2 rounded-full ${agent.isActive ? 'bg-[#34C759]' : 'bg-[#FF3B30]'}`} />
                    <span className="text-[14px] text-[#86868B]">{agent.isActive ? 'Online & Hunting' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="secondary" 
                onClick={handleToggle}
                disabled={isPending}
                className="flex items-center gap-2"
              >
                {agent.isActive ? <><Square size={16} /> Stop Agent</> : <><Play size={16} /> Start Agent</>}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-[#E5E5EA]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#4B5563]">
                  <Database size={18} />
                  <h3 className="text-[14px] font-medium">Companies Scraped</h3>
                </div>
              </div>
              <p className="text-3xl font-semibold text-[#1D1D1F]">{agent._count.companies}</p>
            </Card>

            <Card className="p-6 border-[#E5E5EA]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#4B5563]">
                  <Users size={18} />
                  <h3 className="text-[14px] font-medium">Decision Makers Found</h3>
                </div>
              </div>
              <p className="text-3xl font-semibold text-[#1D1D1F]">{agent._count.contacts}</p>
            </Card>

            <Card className="p-6 border-[#E5E5EA]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[#4B5563]">
                  <Mail size={18} />
                  <h3 className="text-[14px] font-medium">Outreach Drafted</h3>
                </div>
              </div>
              <p className="text-3xl font-semibold text-[#1D1D1F]">{agent._count.outreachMessages}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-[#E5E5EA] flex flex-col h-[500px]">
              <div className="p-5 border-b border-[#E5E5EA] flex justify-between items-center bg-white">
                <h3 className="text-[15px] font-semibold text-[#1D1D1F]">Recent Companies</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {agent.companies.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[#86868B] text-[14px]">No companies discovered yet.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F9F9FB] sticky top-0 z-10 border-b border-[#E5E5EA]">
                      <tr>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Company</th>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Industry</th>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5EA]">
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {agent.companies.map((company: any) => (
                        <tr key={company.id} className="hover:bg-[#F9F9FB] transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-[14px] font-medium text-[#1D1D1F]">{company.name}</p>
                            <p className="text-[13px] text-[#86868B]">{company.domain}</p>
                          </td>
                          <td className="px-5 py-4 text-[13px] text-[#4B5563]">{company.industry || '-'}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-[#E5EDFF] text-[#0071E3]">
                              {company.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            <Card className="border-[#E5E5EA] flex flex-col h-[500px]">
              <div className="p-5 border-b border-[#E5E5EA] flex justify-between items-center bg-white">
                <h3 className="text-[15px] font-semibold text-[#1D1D1F]">Recent Contacts</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {agent.contacts.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[#86868B] text-[14px]">No contacts extracted yet.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F9F9FB] sticky top-0 z-10 border-b border-[#E5E5EA]">
                      <tr>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Contact</th>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Company</th>
                        <th className="px-5 py-3 text-[12px] font-medium text-[#86868B] uppercase tracking-wider">Verified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5EA]">
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {agent.contacts.map((contact: any) => (
                        <tr key={contact.id} className="hover:bg-[#F9F9FB] transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-[14px] font-medium text-[#1D1D1F]">{contact.fullName}</p>
                            <p className="text-[13px] text-[#86868B]">{contact.title}</p>
                          </td>
                          <td className="px-5 py-4 text-[13px] text-[#4B5563]">{contact.company?.name || '-'}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-medium ${contact.isVerified ? 'bg-[#EFFFEC] text-[#34C759]' : 'bg-[#FFF3E0] text-[#FF9500]'}`}>
                              {contact.isVerified ? 'Yes' : 'No'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
