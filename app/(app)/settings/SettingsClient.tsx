"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChipInput } from "@/components/ui/ChipInput";
import { updateWorkspaceSettings } from "./actions";

interface SettingsClientProps {
  initialDemoMode: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  icp: Record<string, any> | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: Record<string, any> | null;
}

export function SettingsClient({ initialDemoMode, icp, offer }: SettingsClientProps) {
  const [demoMode] = useState(initialDemoMode);
  const [autoApprove, setAutoApprove] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ICP State
  const [icpData, setIcpData] = useState({
    geographies: icp?.geographies || [],
    regions: icp?.regions || [],
    industries: icp?.industries || [],
    businessModel: icp?.businessModel || [],
    technologies: icp?.technologies || [],
    buyerRoles: icp?.buyerRoles || [],
    excludedIndustries: icp?.excludedIndustries || [],
    buyingSignals: icp?.buyingSignals || [],
  });

  // Offer State
  const [offerData, setOfferData] = useState({
    name: offer?.name || "",
    description: offer?.description || "",
    services: offer?.services || [],
    targetProblems: offer?.targetProblems || [],
    buyerRoles: offer?.buyerRoles || [],
    relevantIndustries: offer?.relevantIndustries || [],
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateWorkspaceSettings({
        demoMode,
        icp: icpData,
        offer: offerData,
      });
      // Could add a toast notification here
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Settings" />
      <main className="flex-1 overflow-y-auto p-8 bg-[#F5F5F7]">
        <div className="mx-auto max-w-4xl space-y-8">
          
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#1D1D1F]">Workspace Configuration</h2>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Ideal Customer Profile (ICP)</h3>
            <Card className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChipInput
                  label="Countries / Geographies"
                  value={icpData.geographies}
                  onChange={(val) => setIcpData({ ...icpData, geographies: val })}
                  placeholder="e.g. United States, Canada"
                />
                <ChipInput
                  label="Regions"
                  value={icpData.regions}
                  onChange={(val) => setIcpData({ ...icpData, regions: val })}
                  placeholder="e.g. North America, EMEA"
                />
                <ChipInput
                  label="Industries"
                  value={icpData.industries}
                  onChange={(val) => setIcpData({ ...icpData, industries: val })}
                  placeholder="e.g. SaaS, Technology"
                />
                <ChipInput
                  label="Excluded Industries"
                  value={icpData.excludedIndustries}
                  onChange={(val) => setIcpData({ ...icpData, excludedIndustries: val })}
                  placeholder="e.g. B2C, Non-profit"
                />
                <ChipInput
                  label="Business Model"
                  value={icpData.businessModel}
                  onChange={(val) => setIcpData({ ...icpData, businessModel: val })}
                  placeholder="e.g. B2B, Subscription"
                />
                <ChipInput
                  label="Technologies Used"
                  value={icpData.technologies}
                  onChange={(val) => setIcpData({ ...icpData, technologies: val })}
                  placeholder="e.g. Salesforce, AWS"
                />
                <div className="md:col-span-2">
                  <ChipInput
                    label="Buying Signals"
                    value={icpData.buyingSignals}
                    onChange={(val) => setIcpData({ ...icpData, buyingSignals: val })}
                    placeholder="e.g. hiring sales, series b"
                  />
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Target Buyer Roles"
                    value={icpData.buyerRoles}
                    onChange={(val) => setIcpData({ ...icpData, buyerRoles: val })}
                    placeholder="e.g. VP of Sales, CRO"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Offer Configuration</h3>
            <Card className="p-6 space-y-6">
              <div>
                <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Offer Name</label>
                <input
                  type="text"
                  value={offerData.name}
                  onChange={(e) => setOfferData({ ...offerData, name: e.target.value })}
                  className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 text-[14px] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] transition-all"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">Offer Description / Elevator Pitch</label>
                <textarea
                  value={offerData.description}
                  onChange={(e) => setOfferData({ ...offerData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-[#E5E5EA] px-3 py-2 text-[14px] focus:border-[#0071E3] focus:outline-none focus:ring-1 focus:ring-[#0071E3] transition-all resize-none"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChipInput
                  label="Services Offered"
                  value={offerData.services}
                  onChange={(val) => setOfferData({ ...offerData, services: val })}
                  placeholder="e.g. AI Implementation, Coaching"
                />
                <ChipInput
                  label="Target Buyer Roles"
                  value={offerData.buyerRoles}
                  onChange={(val) => setOfferData({ ...offerData, buyerRoles: val })}
                  placeholder="e.g. VP of Sales"
                />
                <div className="md:col-span-2">
                  <ChipInput
                    label="Target Problems (Pain Points)"
                    value={offerData.targetProblems}
                    onChange={(val) => setOfferData({ ...offerData, targetProblems: val })}
                    placeholder="e.g. Low outbound reply rates"
                  />
                </div>
                <div className="md:col-span-2">
                  <ChipInput
                    label="Relevant Industries"
                    value={offerData.relevantIndustries}
                    onChange={(val) => setOfferData({ ...offerData, relevantIndustries: val })}
                    placeholder="e.g. Software, Healthcare"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Agent Configuration</h3>
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setAutoApprove(!autoApprove)}>
                <div>
                  <h4 className="text-[14px] font-medium text-[#1D1D1F]">Auto-Approve Outreach</h4>
                  <p className="text-[13px] text-[#86868B]">Send emails without manual review.</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoApprove ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${autoApprove ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </div>
            </Card>
          </div>

          <div>
            <h3 className="text-xl font-medium text-[#1D1D1F] mb-4">Demonstration Controls</h3>
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <h4 className="text-[14px] font-medium text-[#1D1D1F]">Load Full Demo Pipeline</h4>
                  <p className="text-[13px] text-[#86868B]">Seeds the database with a complete pipeline journey (discovery, scoring, outreach, and simulated replies). Useful for live product presentations.</p>
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="primary" 
                    onClick={async () => {
                      setIsSaving(true);
                      await fetch("/api/demo/seed", { method: "POST" });
                      window.location.reload();
                    }}
                    disabled={isSaving}
                  >
                    LOAD DEMO
                  </Button>
                  <Button 
                    className="bg-[#FF3B30] text-white hover:bg-[#D70015]" 
                    onClick={async () => {
                      if (!confirm("Are you sure you want to completely wipe all demo data?")) return;
                      setIsSaving(true);
                      await fetch("/api/demo/reset", { method: "POST" });
                      window.location.reload();
                    }}
                    disabled={isSaving}
                  >
                    RESET DEMO
                  </Button>
                </div>
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
