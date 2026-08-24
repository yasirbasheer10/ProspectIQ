"use client";

import { useCallback, useState } from "react";
import { FileDown, ListFilter, Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Topbar } from "@/components/layout/Topbar";
import { startDiscovery } from "./actions";
import { useDiscoveryPolling } from "./useDiscoveryPolling";
import { useIcpForm } from "./useIcpForm";
import { GeographyCard } from "./_components/GeographyCard";
import { ExcludeCard, IndustryCard, KeywordsCard, SizeCard } from "./_components/IcpCards";
import { DiscoveryLoadingOverlay } from "./_components/DiscoveryLoadingOverlay";
import { LocationSelectionModal } from "./_components/LocationSelectionModal";

/**
 * The discovery screen: pick an ICP (or paste domains), start a run, watch it.
 *
 * This file was 808 lines holding all of that plus the form state, the polling
 * loop, five option cards, a loading overlay and a location-picker modal. Those
 * now live alongside it — `useIcpForm` owns the form state, `useDiscoveryPolling`
 * owns the run lifecycle, `_components/` owns the presentation — leaving this
 * file to do the one thing its name suggests: wire them together.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DiscoveryClient({ icp }: { icp: any }) {
  const [mode, setMode] = useState<"icp" | "manual">("icp");
  const [customDomainsText, setCustomDomainsText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [runIdToPoll, setRunIdToPoll] = useState<string | null>(null);
  const [activeCountryModal, setActiveCountryModal] = useState<{ name: string; isoCode: string } | null>(null);

  const form = useIcpForm(icp);

  // Stable, so the polling effect does not resubscribe on every render.
  const handleSettled = useCallback((error: string | null) => {
    setRunIdToPoll(null);
    if (error) {
      setIsScanning(false);
      setErrorMsg(error);
    }
    // On success the hook navigates away, so the overlay stays up until it does.
  }, []);

  const { step, setStep } = useDiscoveryPolling({ runId: runIdToPoll, onSettled: handleSettled });

  const handleScan = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    setStep(1); // Initializing
    try {
      const res =
        mode === "manual"
          ? await startDiscovery({ customDomains: customDomainsText })
          : await startDiscovery({ icpParams: form.buildIcpParams() });

      setStep(2); // Searching the web / extracting domains

      if (res?.runId) {
        setRunIdToPoll(res.runId);
      } else {
        // Without a run id there is nothing to poll, so the overlay would hang.
        setIsScanning(false);
        setErrorMsg("Discovery did not start — no run was created. Please try again.");
      }
    } catch (e: unknown) {
      console.error(e);
      setIsScanning(false);
      setErrorMsg(e instanceof Error ? e.message : "An unexpected error occurred while starting discovery.");
    }
  };

  const scanDisabled =
    isScanning ||
    (mode === "manual" && customDomainsText.trim().length === 0) ||
    (mode === "icp" && !form.hasGeography);

  return (
    <div className="flex h-full flex-col bg-white">
      <Topbar title="Discover" />

      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="mx-auto max-w-4xl mt-0">
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-[#FF3B30]/10 p-4 border border-[#FF3B30]/20 flex items-start gap-3 text-[#FF3B30]">
              <X className="shrink-0 mt-0.5" size={18} />
              <p className="text-[14px] font-medium leading-tight">{errorMsg}</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-3xl font-medium tracking-tight text-[#1D1D1F] mb-1.5">
                Who should we find?
              </h2>
              <p className="text-[14px] text-[#4B5563] max-w-xl leading-relaxed">
                Configure your discovery parameters or manually import targets.
              </p>
            </div>

            <div className="flex bg-[#F2F2F7] p-1 rounded-xl">
              <button
                onClick={() => setMode("icp")}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === "icp"
                    ? "bg-white shadow-sm text-[#1D1D1F]"
                    : "text-[#86868B] hover:text-[#4B5563]"
                }`}
              >
                <ListFilter size={16} /> ICP Match
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === "manual"
                    ? "bg-white shadow-sm text-[#1D1D1F]"
                    : "text-[#86868B] hover:text-[#4B5563]"
                }`}
              >
                <FileDown size={16} /> Manual Import
              </button>
            </div>
          </div>

          {mode === "icp" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
              <GeographyCard
                selectedGeo={form.selectedGeo}
                onOpenCountry={setActiveCountryModal}
                onRemoveCountry={form.removeCountry}
              />
              <IndustryCard industries={form.industries} onToggle={form.toggleIndustry} />
              <SizeCard
                isSizeEnabled={form.isSizeEnabled}
                setIsSizeEnabled={form.setIsSizeEnabled}
                sizeIndex={form.sizeIndex}
                setSizeIndex={form.setSizeIndex}
              />
              <KeywordsCard
                keywords={form.keywords}
                keywordInput={form.keywordInput}
                setKeywordInput={form.setKeywordInput}
                addKeyword={form.addKeyword}
                removeKeyword={form.removeKeyword}
              />
              <ExcludeCard
                excludeKeywords={form.excludeKeywords}
                excludeInput={form.excludeInput}
                setExcludeInput={form.setExcludeInput}
                addExclude={form.addExclude}
                removeExclude={form.removeExclude}
                suggestedExclusions={form.suggestedExclusions}
                toggleSuggestedExclude={form.toggleSuggestedExclude}
                selectAllSuggested={form.selectAllSuggested}
              />
            </div>
          )}

          {mode === "manual" && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <Card className="p-8 shadow-sm border-[#E5E5EA]">
                <div className="flex items-center gap-3 mb-2">
                  <FileDown size={24} className="text-[#1D1D1F]" />
                  <h3 className="text-xl font-medium text-[#1D1D1F]">Target Domains</h3>
                </div>
                <p className="text-sm text-[#4B5563] mb-6">
                  Provide a list of specific company domains you want the AI to research. The agent
                  will skip public search and exclusively analyze these targets.
                </p>
                <textarea
                  className="w-full h-64 p-5 rounded-xl border border-[#E5E5EA] bg-[#F5F5F7] text-sm focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] focus:bg-white transition-colors resize-none font-mono"
                  placeholder="stripe.com&#10;vercel.com&#10;linear.app"
                  value={customDomainsText}
                  onChange={(e) => setCustomDomainsText(e.target.value)}
                />
              </Card>
            </div>
          )}

          <div className="mt-5 flex border-t border-[#E5E5EA] pt-5">
            <Button
              variant="primary"
              className="rounded-[10px] py-[14px] px-8 font-medium text-[15px] transition-colors shadow-sm"
              icon={Search}
              onClick={handleScan}
              disabled={scanDisabled}
            >
              {mode === "manual" ? "Import & Analyze Targets" : "Find Opportunities"}
            </Button>
          </div>
        </div>
      </main>

      {isScanning && <DiscoveryLoadingOverlay step={step} />}

      {activeCountryModal && (
        <LocationSelectionModal
          countryName={activeCountryModal.name}
          countryCode={activeCountryModal.isoCode}
          currentSelection={form.selectedGeo[activeCountryModal.name] || []}
          onClose={() => setActiveCountryModal(null)}
          onSave={(locations) => {
            form.setCountryLocations(activeCountryModal.name, locations);
            setActiveCountryModal(null);
          }}
        />
      )}
    </div>
  );
}
