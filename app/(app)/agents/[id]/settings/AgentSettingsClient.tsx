"use client";

import { useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Save, Trash2, Bot, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateAgentAction, deleteAgentAction } from "./actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgentSettingsClient({ agent }: { agent: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  
  const [name, setName] = useState(agent.name);
  const [goal, setGoal] = useState(agent.goal || "");
  const [isActive, setIsActive] = useState(agent.isActive);

  const handleSave = () => {
    startTransition(async () => {
      await updateAgentAction(agent.id, { name, goal, isActive });
      router.push("/agents");
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this agent? All associated leads will remain, but the agent will be removed.")) {
      startDeleting(async () => {
        await deleteAgentAction(agent.id);
        router.push("/agents");
      });
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7]">
      <Topbar 
        title="Agent Configuration" 
        actions={
          <div className="flex items-center gap-2">
            <Link href="/agents">
              <Button variant="ghost" size="sm" icon={ArrowLeft}>Back to Fleet</Button>
            </Link>
          </div>
        }
      />
      
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white rounded-[16px] border border-[#E5E5EA] p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-[10px] bg-[#1D1D1F] text-white flex items-center justify-center">
                <Bot size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#1D1D1F]">Reconfigure Agent</h2>
                <p className="text-[13px] text-[#86868B]">Update instructions and status for {agent.name}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[13px] font-medium text-[#1D1D1F] block mb-2">Agent Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-4 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[10px] text-[14px] focus:outline-none focus:border-[#0071E3] transition-colors"
                  placeholder="e.g. Enterprise SaaS Hunter"
                />
              </div>

              <div>
                <label className="text-[13px] font-medium text-[#1D1D1F] block mb-2 flex items-center gap-1.5">
                  <Target size={14} className="text-[#86868B]" />
                  Primary Goal & Instructions
                </label>
                <textarea 
                  rows={4}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full p-4 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[10px] text-[14px] focus:outline-none focus:border-[#0071E3] transition-colors resize-none leading-relaxed"
                  placeholder="What is this agent's specific directive?"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[10px]">
                <div>
                  <h4 className="text-[14px] font-medium text-[#1D1D1F]">Agent Status</h4>
                  <p className="text-[13px] text-[#86868B]">Determine if this agent is actively running the background pipeline.</p>
                </div>
                <button 
                  onClick={() => setIsActive(!isActive)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isActive ? 'bg-[#34C759]' : 'bg-[#D1D1D6]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isActive ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E5E5EA] flex items-center justify-between">
              <Button variant="danger" icon={Trash2} loading={isDeleting} onClick={handleDelete}>
                Delete Agent
              </Button>
              <Button variant="primary" icon={Save} loading={isPending} onClick={handleSave}>
                Save Configuration
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
