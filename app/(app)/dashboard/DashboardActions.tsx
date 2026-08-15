"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Brain } from "lucide-react";
import { startOrchestratorAction } from "./actions";

export function DashboardActions() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  const handleStartOrchestrator = async () => {
    setIsStarting(true);
    try {
      await startOrchestratorAction();
      router.push("/agent-activity");
    } catch (e) {
      console.error(e);
      setIsStarting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 mt-2">
      <Link href="/discovery">
        <button className="inline-flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-[8px] py-[10px] px-6 font-medium text-[14px] transition-colors shadow-sm min-w-[180px]">
          Start Discovery
          <ArrowRight size={16} strokeWidth={2} className="ml-1" />
        </button>
      </Link>
      
      <button 
        onClick={handleStartOrchestrator}
        disabled={isStarting}
        className="inline-flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-[8px] py-[10px] px-6 font-medium text-[14px] transition-colors shadow-sm disabled:opacity-50 min-w-[180px]"
      >
        <Brain size={16} strokeWidth={2} className="mr-1" />
        {isStarting ? "Starting Brain..." : "Start Auto-Pilot"}
      </button>
    </div>
  );
}
