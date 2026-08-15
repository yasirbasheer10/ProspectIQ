"use client";

import { useEffect, useState, useTransition } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Bot, Search, Zap, Target, Mail, Play, Pause, Square, Activity, Clock, CheckCircle2, Server, Sparkles } from "lucide-react";
import { startOrchestratorAction, pauseOrchestratorAction, stopOrchestratorAction, clearAuditLogsAction } from "./actions";
import { useRouter } from "next/navigation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgentActivityClient({ activeRun, finalLogs }: { activeRun: any, finalLogs: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hasRedirected, setHasRedirected] = useState(false);

  // Auto-refresh the page every 2 seconds if the orchestrator is running
  useEffect(() => {
    if (activeRun?.status === "RUNNING") {
      const interval = setInterval(() => {
        router.refresh();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [activeRun?.status, router]);

  // Auto-redirect to Outreach when completed
  useEffect(() => {
    if (activeRun?.status === "COMPLETED" && !hasRedirected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasRedirected(true);
      const timer = setTimeout(() => {
        router.push("/outreach");
      }, 4000); // 4 seconds to show success state before redirecting
      return () => clearTimeout(timer);
    }
  }, [activeRun?.status, hasRedirected, router]);

  const handleStart = () => {
    startTransition(async () => {
      await startOrchestratorAction();
    });
  };

  const handlePause = () => {
    if (!activeRun) return;
    startTransition(async () => {
      await pauseOrchestratorAction(activeRun.id);
    });
  };

  const handleStop = () => {
    if (!activeRun) return;
    startTransition(async () => {
      await stopOrchestratorAction(activeRun.id);
    });
  };

  const handleClear = () => {
    startTransition(async () => {
      await clearAuditLogsAction();
    });
  };

  const getPipelineStage = () => {
    if (!activeRun?.outputData?.currentStep) return 0;
    const step = activeRun.outputData.currentStep;
    if (step.includes("RESEARCH")) return 1;
    if (step.includes("BUYER") || step.includes("OPPORTUNITY")) return 2;
    if (step.includes("OUTREACH")) return 3;
    return 0; // Discover
  };

  const currentStage = getPipelineStage();

  return (
    <div className="flex h-full flex-col bg-[#FAFAFC]">
      <Topbar title="Agent Pipeline" />
      
      <main className="flex-1 overflow-y-auto p-6 relative">
        <div className="mx-auto max-w-[1200px] space-y-6 relative z-10">
          
          {/* Main Control Panel */}
          <div className="flex items-center justify-between bg-white/60 backdrop-blur-xl border border-[#E5E5EA] p-4 rounded-[20px] shadow-sm">
            <div className="flex items-center gap-4 pl-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeRun?.status === "RUNNING" ? "bg-[#0071E3]/10 text-[#0071E3] animate-pulse" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                <Activity size={20} />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-[#1D1D1F]">Pipeline Controls</h2>
                <p className="text-[13px] text-[#86868B]">Manage autonomous agent execution</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 bg-[#F5F5F7] p-1.5 rounded-[14px]">
              <Button
                variant="ghost"
                size="sm"
                icon={Play}
                disabled={activeRun?.status === "RUNNING" || isPending}
                onClick={handleStart}
                className={`rounded-[10px] ${activeRun?.status === "RUNNING" ? "" : "bg-white text-[#0071E3] shadow-sm hover:text-[#0071E3]"}`}
              >
                Start Run
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Pause}
                disabled={activeRun?.status !== "RUNNING" || isPending}
                onClick={handlePause}
                className="rounded-[10px] text-[#1D1D1F] hover:bg-white"
              >
                Pause
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Square}
                disabled={(!activeRun || activeRun?.status === "COMPLETED" || activeRun?.status === "CANCELLED" || activeRun?.status === "FAILED") || isPending}
                onClick={handleStop}
                className="rounded-[10px] text-[#FF3B30] hover:bg-[#FF3B30]/10"
              >
                Stop
              </Button>
            </div>
          </div>

          {/* Visual Pipeline Tracker */}
          <div className="bg-white border border-[#E5E5EA] rounded-[24px] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[14px] font-semibold text-[#1D1D1F] flex items-center gap-2">
                <Server size={14} className="text-[#0071E3]" />
                Execution Pipeline
              </h3>
              {activeRun && (
                <div className="flex items-center gap-2">
                  <Badge variant={
                    activeRun.status === 'RUNNING' ? 'info' :
                    activeRun.status === 'PAUSED' ? 'warning' :
                    activeRun.status === 'FAILED' ? 'danger' :
                    activeRun.status === 'COMPLETED' ? 'success' : 'default'
                  }>
                    {activeRun.status}
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between relative">
              {/* Connecting Line */}
              <div className="absolute left-[10%] right-[10%] top-1/2 -translate-y-1/2 h-1 bg-[#F5F5F7] rounded-full z-0 overflow-hidden">
                {activeRun?.status === "RUNNING" && (
                  <div className="h-full bg-gradient-to-r from-transparent via-[#0071E3] to-transparent w-1/2 animate-[shimmer_2s_infinite]" />
                )}
              </div>

              {/* Stages */}
              {[
                { id: 0, label: "Discover", icon: Search },
                { id: 1, label: "Intelligence", icon: Zap },
                { id: 2, label: "Personas", icon: Target },
                { id: 3, label: "Outreach", icon: Mail },
              ].map((stage) => {
                const isActive = activeRun?.status === "RUNNING" && currentStage === stage.id;
                const isPast = activeRun?.status === "COMPLETED" || (activeRun?.status === "RUNNING" && currentStage > stage.id);
                const Icon = stage.icon;

                return (
                  <div key={stage.id} className="relative z-10 flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-sm ${
                      isActive ? 'bg-[#0071E3] text-white scale-110 ring-4 ring-[#0071E3]/20 shadow-[0_0_20px_rgba(0,113,227,0.4)]' :
                      isPast ? 'bg-[#1D1D1F] text-white' :
                      'bg-white border-2 border-[#E5E5EA] text-[#86868B]'
                    }`}>
                      {isPast && !isActive ? <CheckCircle2 size={18} /> : <Icon size={isActive ? 18 : 16} />}
                    </div>
                    <span className={`text-[12px] font-medium transition-colors ${isActive || isPast ? 'text-[#1D1D1F]' : 'text-[#86868B]'}`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
            {/* Now Executing Hero Card */}
            <div className="flex flex-col h-[340px]">
              {activeRun ? (
                activeRun.status === "COMPLETED" ? (
                  <div className="flex-1 bg-gradient-to-br from-[#EFFFEC] to-[#F2FFF0] border border-[#34C759]/30 rounded-[24px] p-8 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-sm">
                    <div className="absolute inset-0 bg-[#34C759]/5 blur-3xl rounded-full scale-150 opacity-50" />
                    <div className="w-16 h-16 bg-white shadow-[0_0_40px_rgba(52,199,89,0.3)] rounded-full flex items-center justify-center mb-4 relative z-10 animate-bounce-slow">
                      <CheckCircle2 size={32} className="text-[#34C759]" />
                    </div>
                    <div className="relative z-10">
                      <h3 className="text-[24px] font-semibold text-[#1D1D1F] tracking-tight mb-2">Pipeline Completed!</h3>
                      <p className="text-[14px] text-[#4B5563] max-w-md mx-auto mb-6">All discovered leads have been successfully processed. Generating highly personalized outreach drafts...</p>
                      
                      <div className="flex gap-4 justify-center">
                        <div className="bg-white/80 backdrop-blur-md border border-[#34C759]/20 shadow-sm rounded-xl px-5 py-3">
                          <div className="text-[24px] font-bold text-[#1D1D1F]">{activeRun.processedItems || 0}</div>
                          <div className="text-[11px] text-[#86868B] uppercase tracking-wider font-semibold mt-1">Processed</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 bg-[#1D1D1F] rounded-[24px] p-8 relative overflow-hidden shadow-xl flex flex-col justify-center">
                    {/* Glassmorphic animated background gradients */}
                    <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[70%] bg-[#0071E3] rounded-full blur-[100px] opacity-30 animate-pulse-slow" />
                    <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[60%] bg-[#5856D6] rounded-full blur-[100px] opacity-20 animate-pulse-slow" style={{ animationDelay: '2s' }} />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white text-[11px] font-medium uppercase tracking-wider flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                          Now Executing
                        </div>
                        <span className="text-white/60 text-[12px] flex items-center gap-1.5">
                          <Clock size={14} /> 
                          {activeRun.processedItems}/{activeRun.totalItems} Companies
                        </span>
                      </div>
                      
                      {activeRun.outputData?.currentStep ? (
                        <>
                          <h2 className="text-[28px] font-semibold text-white leading-tight mb-3 tracking-tight">
                            {activeRun.outputData.currentStep.replace('_', ' ')}
                            {activeRun.outputData.currentCompany && (
                              <span className="block text-white/50 text-[20px] mt-1 font-medium">{activeRun.outputData.currentCompany}</span>
                            )}
                          </h2>
                          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 inline-block mt-2 max-w-xl">
                            <p className="text-[14px] text-white/80 leading-relaxed flex items-start gap-3">
                              <Sparkles size={16} className="text-[#0071E3] shrink-0 mt-0.5" />
                              {activeRun.outputData.details}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-start gap-3">
                          <h2 className="text-[24px] font-semibold text-white">Initializing Pipeline...</h2>
                          <div className="flex gap-2">
                            <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" />
                            <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0.2s' }} />
                            <div className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="flex-1 bg-white border border-[#E5E5EA] rounded-[24px] p-8 flex flex-col items-center justify-center text-center shadow-sm">
                  <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
                    <Bot size={24} className="text-[#86868B]" />
                  </div>
                  <h2 className="text-[20px] font-semibold text-[#1D1D1F] tracking-tight mb-2">Agent Standing By</h2>
                  <p className="text-[14px] text-[#86868B] max-w-md">The orchestration pipeline is ready. Press start to process all pending leads, extract intelligence, and generate targeted outreach.</p>
                </div>
              )}
            </div>

            {/* Notification Center */}
            <div className="flex flex-col h-[340px] bg-transparent">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-[14px] font-semibold text-[#1D1D1F] uppercase tracking-wider flex items-center gap-2">
                  <Activity size={16} className="text-[#86868B]" />
                  Recent Actions
                </h3>
                <button onClick={handleClear} className="text-[12px] font-medium text-[#86868B] hover:text-[#1D1D1F] transition-colors">Clear</button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide pb-10 relative">
                {finalLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                    <p className="text-[13px] font-medium text-[#86868B]">No recent actions.</p>
                  </div>
                ) : (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  finalLogs.map((log: any, index: number) => {
                    const iconName = log.icon;
                    let Icon = Activity;
                    let iconColorClass = "text-[#4B5563] bg-white";
                    
                    if (iconName === 'Search') {
                      Icon = Search;
                      iconColorClass = "text-[#0071E3] bg-[#0071E3]/10";
                    } else if (iconName === 'Zap') {
                      Icon = Zap;
                      iconColorClass = "text-[#FF9500] bg-[#FF9500]/10";
                    } else if (iconName === 'Target') {
                      Icon = Target;
                      iconColorClass = "text-[#34C759] bg-[#34C759]/10";
                    } else if (iconName === 'Mail') {
                      Icon = Mail;
                      iconColorClass = "text-[#5856D6] bg-[#5856D6]/10";
                    } else if (iconName === 'Bot') {
                      Icon = Bot;
                      iconColorClass = "text-[#1D1D1F] bg-[#1D1D1F]/10";
                    }

                    // Fade out effect for older logs
                    const opacity = Math.max(100 - (index * 15), 30);

                    return (
                      <div 
                        key={log.id || index} 
                        className="bg-white border border-[#E5E5EA] rounded-[16px] p-4 shadow-[0_2px_10px_rgb(0,0,0,0.02)] transition-all hover:-translate-y-0.5 hover:shadow-md"
                        style={{ opacity: `${opacity}%` }}
                      >
                        <div className="flex gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${iconColorClass}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-0.5">
                              <p className="text-[13px] font-semibold text-[#1D1D1F] truncate pr-2">{log.action}</p>
                              <span className="text-[10px] font-medium text-[#86868B] whitespace-nowrap pt-0.5">{log.time}</span>
                            </div>
                            <p className="text-[12px] text-[#6E6E73] leading-snug line-clamp-2">{log.details}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {/* Fade gradient at the bottom of the scroll container */}
                <div className="fixed bottom-8 w-[350px] h-20 bg-gradient-to-t from-[#FAFAFC] to-transparent pointer-events-none" />
              </div>
            </div>

          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.1); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        .animate-bounce-slow {
          animation: bounce 3s infinite;
        }
      `}} />
    </div>
  );
}
