"use client";

import { Check, Globe } from "lucide-react";
import type { DiscoveryStep } from "../useDiscoveryPolling";

/** The three-step checklist that tracks the run's phases. */
const STAGES = [
  { label: "Booting AI Agents", clearedAt: 1 },
  { label: "Target Acquisition", clearedAt: 2 },
  { label: "Deep Intelligence Extraction", clearedAt: 3 },
] as const;

export function DiscoveryLoadingOverlay({ step }: { step: DiscoveryStep }) {
  return (
    <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-white border border-[#E5E5EA] shadow-2xl rounded-2xl p-8 flex flex-col items-center text-center">
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 border-4 border-[#F5F5F7] rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[#0071E3] rounded-full border-t-transparent animate-spin"></div>
          <Globe className="text-[#0071E3] w-8 h-8 animate-pulse" />
        </div>

        <h3 className="text-2xl font-semibold text-[#1D1D1F] mb-2">
          {step === 1 && "Initializing Engine..."}
          {step === 2 && "Scouring the Web..."}
          {step === 3 && "Analyzing Company Data..."}
          {step === 4 && "Finalizing Results..."}
        </h3>

        <p className="text-[15px] text-[#4B5563] mb-8 max-w-[280px]">
          {step <= 2 && "The AI is searching Google to find companies matching your exact criteria."}
          {step === 3 && "Crawling websites and extracting firmographics, signals, and decision makers."}
          {step === 4 && "Redirecting to your dashboard..."}
        </p>

        <div className="w-full space-y-4 text-left">
          {STAGES.map((stage) => {
            const done = step > stage.clearedAt;
            const active = step === stage.clearedAt;
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    done ? "bg-[#34C759]" : active ? "border-2 border-[#0071E3]" : "bg-[#E5E5EA]"
                  }`}
                >
                  {done && <Check size={12} className="text-white" />}
                </div>
                <span
                  className={`text-[14px] ${
                    done
                      ? "text-[#1D1D1F] font-medium"
                      : active
                      ? "text-[#0071E3] font-semibold"
                      : "text-[#86868B]"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
