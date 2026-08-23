"use client";

import { useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Bot, Search, Mail, Zap, CheckCircle2, ChevronRight, Settings2 } from "lucide-react";
import { deployCustomAgent } from "./actions";
import { useRouter } from "next/navigation";

// No longer takes a workspaceId — the server action reads it from the session,
// so passing it through the browser served no purpose but to be tampered with.
export function DeployAgentClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    goal: "",
    schedule: "continuous",
    budgetLimit: 50,
  });

  const [tools, setTools] = useState({
    webSearch: true,
    linkedIn: false,
    emailDrafting: true,
    signalMonitoring: false,
  });

  const handleDeploy = () => {
    if (!formData.name) return;
    
    startTransition(async () => {
      const selectedTools = Object.entries(tools)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
        .filter(([_, enabled]) => enabled)
        .map(([key]) => key);

      await deployCustomAgent({
        // No workspaceId — the action takes it from the session.
        name: formData.name,
        goal: formData.goal,
        tools: selectedTools,
        schedule: formData.schedule,
        budgetLimit: formData.budgetLimit,
      });

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/agents");
      }, 2000);
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Deploy Custom Agent" />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-3xl space-y-8">
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#1D1D1F] text-white shadow-sm">
              <Bot size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">Configure New Agent</h1>
              <p className="text-[14px] text-[#86868B] mt-0.5">Define goals, select tools, and set operational boundaries.</p>
            </div>
          </div>

          {isSuccess ? (
            <Card className="p-12 border-[#E5E5EA] flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 bg-[#EFFFEC] rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-[#34C759]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[#1D1D1F]">Agent Deployed Successfully</h3>
                <p className="text-[#86868B] mt-2">Your new agent &quot;{formData.name}&quot; is now online.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              
              <Card className="p-6 border-[#E5E5EA] space-y-6">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-4 flex items-center gap-2">
                    <Settings2 size={16} className="text-[#0071E3]" />
                    Identity & Objective
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Agent Name</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g. LinkedIn Enterprise Scraper"
                        className="w-full h-10 px-3 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[8px] text-[14px] outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Primary Goal</label>
                      <textarea 
                        value={formData.goal}
                        onChange={(e) => setFormData({...formData, goal: e.target.value})}
                        placeholder="Describe what this agent should hunt for..."
                        className="w-full p-3 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[8px] text-[14px] outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all min-h-[100px] resize-none"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-[#E5E5EA]">
                <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-4">Capabilities (Tools)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <ToolCard 
                    title="Web Search" 
                    desc="Search Google for companies and news" 
                    icon={Search} 
                    enabled={tools.webSearch} 
                    onClick={() => setTools({...tools, webSearch: !tools.webSearch})}
                  />
                  <ToolCard 
                    title="LinkedIn Scraping" 
                    desc="Extract decision makers from LinkedIn" 
                    icon={Bot} 
                    enabled={tools.linkedIn} 
                    onClick={() => setTools({...tools, linkedIn: !tools.linkedIn})}
                  />
                  <ToolCard 
                    title="Email Drafting" 
                    desc="Generate highly personalized emails" 
                    icon={Mail} 
                    enabled={tools.emailDrafting} 
                    onClick={() => setTools({...tools, emailDrafting: !tools.emailDrafting})}
                  />
                  <ToolCard 
                    title="Signal Monitoring" 
                    desc="Watch for job postings and funding" 
                    icon={Zap} 
                    enabled={tools.signalMonitoring} 
                    onClick={() => setTools({...tools, signalMonitoring: !tools.signalMonitoring})}
                  />
                </div>
              </Card>

              <Card className="p-6 border-[#E5E5EA]">
                <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-4">Operational Boundaries</h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[13px] font-medium text-[#4B5563] mb-2">Schedule</label>
                    <select 
                      value={formData.schedule}
                      onChange={(e) => setFormData({...formData, schedule: e.target.value})}
                      className="w-full h-10 px-3 bg-[#F9F9FB] border border-[#E5E5EA] rounded-[8px] text-[14px] outline-none"
                    >
                      <option value="continuous">Continuous (Always On)</option>
                      <option value="daily">Daily Batch</option>
                      <option value="weekly">Weekly Batch</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center justify-between text-[13px] font-medium text-[#4B5563] mb-2">
                      <span>Daily Budget Limit (Companies)</span>
                      <span className="text-[#0071E3] bg-[#E5EDFF] px-2 py-0.5 rounded text-[12px]">{formData.budgetLimit}</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" 
                      max="500" 
                      step="10"
                      value={formData.budgetLimit}
                      onChange={(e) => setFormData({...formData, budgetLimit: parseInt(e.target.value)})}
                      className="w-full accent-[#0071E3]"
                    />
                  </div>
                </div>
              </Card>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleDeploy}
                  disabled={isPending || !formData.name}
                  className="bg-[#1D1D1F] hover:bg-[#000000] text-white px-8 flex items-center gap-2"
                >
                  {isPending ? "Deploying..." : "Deploy Agent"}
                  <ChevronRight size={16} />
                </Button>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ToolCard({ title, desc, icon: Icon, enabled, onClick }: { title: string, desc: string, icon: any, enabled: boolean, onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-[12px] border cursor-pointer transition-all ${
        enabled 
          ? 'border-[#0071E3] bg-[#F4F9FF]' 
          : 'border-[#E5E5EA] bg-white hover:border-[#D1D1D6]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          enabled ? 'bg-[#0071E3] text-white' : 'bg-[#F5F5F7] text-[#86868B]'
        }`}>
          <Icon size={14} />
        </div>
        <div>
          <h4 className={`text-[14px] font-medium ${enabled ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>{title}</h4>
          <p className="text-[12px] text-[#86868B] mt-0.5">{desc}</p>
        </div>
      </div>
    </div>
  );
}
