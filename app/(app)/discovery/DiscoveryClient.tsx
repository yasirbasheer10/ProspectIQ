"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Globe, Building, Users, Search, Loader2, ListFilter, FileDown, X, Check } from "lucide-react";
import { startDiscovery, checkRunStatus } from "./actions";
import { Country, City, State } from "country-state-city";

const DEFAULT_COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", 
  "Germany", "France", "India", "Brazil", "Japan", "Singapore",
  "Netherlands", "Sweden", "Spain", "Italy", "Mexico", "Ireland"
];

const INDUSTRIES = [
  "SaaS", "E-commerce", "Fintech", "Healthcare", "Marketing",
  "Real Estate", "Manufacturing", "Retail", "Consumer brands",
  "Logistics", "EdTech", "Cybersecurity"
];

const SIZE_BUCKETS = [
  "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DiscoveryClient({ icp }: { icp: any }) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [mode, setMode] = useState<"icp" | "manual">("icp");
  const [customDomainsText, setCustomDomainsText] = useState("");
  
  const [runIdToPoll, setRunIdToPoll] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Poll for completion. Guards against two ways this could otherwise spin
  // forever: (1) checkRunStatus failing repeatedly (session hiccup, network
  // blip) — we stop after MAX_CONSECUTIVE_FAILURES rather than retrying every
  // 2s forever, and (2) the run itself never reaching a terminal status server
  // side — we give up after MAX_POLL_MS total and surface a clear message
  // either way, instead of leaving the UI silently "scanning" indefinitely.
  useEffect(() => {
    if (!runIdToPoll) return;

    const MAX_CONSECUTIVE_FAILURES = 5;
    const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes
    const startedAt = Date.now();
    let consecutiveFailures = 0;

    const stopWithError = (message: string) => {
      clearInterval(interval);
      setRunIdToPoll(null);
      setIsScanning(false);
      setErrorMsg(message);
    };

    const interval = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        stopWithError("Discovery is taking much longer than expected. It may still be running in the background — check the Companies list in a few minutes, or try again.");
        return;
      }

      try {
        const status = await checkRunStatus(runIdToPoll);
        consecutiveFailures = 0; // reset on any successful check, even if still RUNNING

        if (status.status === "COMPLETED" || status.status === "FAILED") {
          clearInterval(interval);
          setRunIdToPoll(null);
          
          if (status.status === "FAILED") {
            setIsScanning(false);
            setErrorMsg("Discovery run failed. Please try again.");
          } else {
            setLoadingStep(4); // 4: Done
            setTimeout(() => {
              router.push("/companies");
            }, 500);
          }
        } else if (status.status === "RUNNING") {
          setLoadingStep(3); // 3: Scraping & Analyzing Pages
        }
      } catch (err) {
        console.error("Polling error:", err);
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopWithError("Lost connection while checking discovery status. Please check the Companies list, or try again.");
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runIdToPoll, router]);
  
  // Geography State
  const [geoSearch, setGeoSearch] = useState("");
  
  // selectedGeo maps Country Name to Array of City/State Names. If array has "ALL", it means all.
  const [selectedGeo, setSelectedGeo] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (icp?.countries?.length) {
      icp.countries.forEach((c: string) => { initial[c] = ["ALL"]; });
    } else {
      initial["United States"] = ["ALL"];
    }
    return initial;
  });

  // Modal State
  const [activeCountryModal, setActiveCountryModal] = useState<{name: string, isoCode: string} | null>(null);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [citySearch, setCitySearch] = useState("");
  
  // Industry State
  const initialIndustries: Record<string, boolean> = icp?.industries?.length > 0 
    ? icp.industries.reduce((acc: Record<string, boolean>, ind: string) => ({ ...acc, [ind]: true }), {})
    : { "SaaS": true, "E-commerce": true };
  const [industries, setIndustries] = useState<Record<string, boolean>>(initialIndustries);

  // Size State
  const [isSizeEnabled, setIsSizeEnabled] = useState(true);
  const [sizeIndex, setSizeIndex] = useState(2); // Default to 51-200

  // Derived Geography Data
  const allGlobalCountries = useMemo(() => Country.getAllCountries(), []);
  
  const filteredCountries = useMemo(() => {
    if (!geoSearch.trim()) return [];
    return allGlobalCountries.filter(c => c.name.toLowerCase().includes(geoSearch.toLowerCase())).slice(0, 50);
  }, [geoSearch, allGlobalCountries]);

  // Countries to show as pills: Defaults + anything currently selected
  const displayedCountryNames = useMemo(() => {
    const set = new Set([...DEFAULT_COUNTRIES, ...Object.keys(selectedGeo)]);
    return Array.from(set);
  }, [selectedGeo]);

  const handleCountrySelect = (countryName: string) => {
    const countryObj = allGlobalCountries.find(c => c.name === countryName);
    if (!countryObj) return;

    // Open modal to select cities/states for this country
    setActiveCountryModal({ name: countryObj.name, isoCode: countryObj.isoCode });
    setCitySearch("");
    
    // Clear search box if we clicked from dropdown
    setGeoSearch("");
  };

  const handleRemoveCountry = (e: React.MouseEvent, countryName: string) => {
    e.stopPropagation();
    const next = { ...selectedGeo };
    delete next[countryName];
    setSelectedGeo(next);
  };

  const handleScan = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    setLoadingStep(1); // 1: Initializing
    try {
      let res;
      if (mode === "manual") {
        res = await startDiscovery({ customDomains: customDomainsText });
      } else {
        const activeIndustries = Object.keys(industries).filter(k => industries[k]);
        res = await startDiscovery({ 
          icpParams: {
            countries: selectedGeo,
            industries: activeIndustries,
            size: isSizeEnabled ? SIZE_BUCKETS[sizeIndex] : null
          }
        });
      }
      
      setLoadingStep(2); // 2: Searching Web / Extracting Domains
      
      if (res && res.runId) {
        setRunIdToPoll(res.runId);
      }
      
    } catch (e: any) {
      console.error(e);
      setIsScanning(false);
      setErrorMsg(e?.message || "An unexpected error occurred while starting discovery.");
    }
  };

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
              <h2 className="text-3xl font-medium tracking-tight text-[#1D1D1F] mb-1.5">Who should we find?</h2>
              <p className="text-[14px] text-[#4B5563] max-w-xl leading-relaxed">
                Configure your discovery parameters or manually import targets.
              </p>
            </div>

            <div className="flex bg-[#F2F2F7] p-1 rounded-xl">
              <button 
                onClick={() => setMode("icp")}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === "icp" ? "bg-white shadow-sm text-[#1D1D1F]" : "text-[#86868B] hover:text-[#4B5563]"}`}
              >
                <ListFilter size={16} /> ICP Match
              </button>
              <button 
                onClick={() => setMode("manual")}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === "manual" ? "bg-white shadow-sm text-[#1D1D1F]" : "text-[#86868B] hover:text-[#4B5563]"}`}
              >
                <FileDown size={16} /> Manual Import
              </button>
            </div>
          </div>

          {mode === "icp" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
              
              {/* Geography Card */}
              <Card className="md:col-span-2 p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <Globe size={24} className="text-[#0071E3]" />
                  <h3 className="text-[18px] font-medium text-[#1D1D1F]">Geography</h3>
                </div>
                <div className="h-px w-full bg-[#E5E5EA] mb-4" />
                
                <div className="mb-4 relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search any country globally..." 
                      className="w-full max-w-md pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-transparent rounded-lg text-sm focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all"
                      value={geoSearch}
                      onChange={e => setGeoSearch(e.target.value)}
                    />
                  </div>
                  
                  {/* Search Dropdown */}
                  {geoSearch.trim().length > 0 && (
                    <div className="absolute z-10 top-full mt-2 w-full max-w-md bg-white border border-[#E5E5EA] rounded-xl shadow-lg max-h-[300px] overflow-y-auto">
                      {filteredCountries.length > 0 ? (
                        <div className="py-2">
                          {filteredCountries.map(c => (
                            <button
                              key={c.isoCode}
                              onClick={() => handleCountrySelect(c.name)}
                              className="w-full text-left px-4 py-2.5 text-sm text-[#1D1D1F] hover:bg-[#F5F5F7] flex items-center justify-between transition-colors"
                            >
                              <span>{c.name}</span>
                              {selectedGeo[c.name] && <Check size={16} className="text-[#0071E3]" />}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-sm text-[#86868B] text-center">No countries found</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {displayedCountryNames.map((countryName) => {
                    const isSelected = !!selectedGeo[countryName];
                    const selection = selectedGeo[countryName] || [];
                    const isUS = countryName === "United States";
                    const locationType = isUS ? "States" : "Cities";
                    
                    let label = countryName;
                    if (isSelected) {
                      if (selection.includes("ALL")) {
                        label = `${countryName} (All ${locationType})`;
                      } else {
                        const len = selection.length;
                        label = `${countryName} (${len > 2 ? `${selection[0]}, ${selection[1]}, +${len-2}` : selection.join(", ")})`;
                      }
                    }

                    return (
                      <button 
                        key={countryName}
                        onClick={() => handleCountrySelect(countryName)}
                        className={`group flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-medium transition-all ${
                          isSelected 
                            ? "border-[#0071E3] bg-[#0071E3] text-white shadow-sm hover:bg-[#0062CC]" 
                            : "border-[#E5E5EA] bg-white text-[#4B5563] hover:border-[#86868B]"
                        }`}
                      >
                        {label}
                        {isSelected && (
                          <div 
                            className="p-0.5 rounded-full hover:bg-black/20 transition-colors"
                            onClick={(e) => handleRemoveCountry(e, countryName)}
                          >
                            <X size={14} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </Card>

              {/* Industry Card */}
              <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <Building size={24} className="text-[#0071E3]" />
                  <h3 className="text-[18px] font-medium text-[#1D1D1F]">Industry</h3>
                </div>
                <div className="h-px w-full bg-[#E5E5EA] mb-4" />
                <div className="space-y-3 max-h-[220px] overflow-y-auto scrollbar-thin">
                  {INDUSTRIES.map((industry) => {
                    const isChecked = industries[industry] || false;
                    return (
                      <label key={industry} className="flex items-center gap-3 cursor-pointer group" onClick={() => setIndustries(prev => ({...prev, [industry]: !prev[industry]}))}>
                        <div className={`w-5 h-5 rounded-[4px] flex items-center justify-center shadow-sm transition-colors ${
                          isChecked ? "bg-[#0071E3] border-none" : "border border-[#E5E5EA] bg-white group-hover:border-[#86868B]"
                        }`}>
                          {isChecked && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span className={`text-[14px] font-medium transition-colors ${isChecked ? "text-[#1D1D1F]" : "text-[#4B5563] group-hover:text-[#0071E3]"}`}>
                          {industry}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Card>

              {/* Size Card */}
              <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Users size={24} className="text-[#0071E3]" />
                    <h3 className="text-[18px] font-medium text-[#1D1D1F]">Company Size</h3>
                  </div>
                  
                  {/* Modern Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isSizeEnabled}
                      onChange={(e) => setIsSizeEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-[#E5E5EA] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#34C759]"></div>
                  </label>
                </div>
                <div className="h-px w-full bg-[#E5E5EA] mb-6" />
                
                <div className={`flex-1 flex flex-col justify-center transition-opacity duration-300 ${isSizeEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-[13px] font-medium text-[#86868B]">Small</span>
                    <span className="text-[15px] font-bold text-[#0071E3] px-4 py-1.5 bg-[#0071E3]/10 rounded-full">
                      {SIZE_BUCKETS[sizeIndex]} employees
                    </span>
                    <span className="text-[13px] font-medium text-[#86868B]">Enterprise</span>
                  </div>
                  
                  <div className="relative pt-2">
                    <input 
                      type="range" 
                      min="0" 
                      max={SIZE_BUCKETS.length - 1} 
                      step="1"
                      value={sizeIndex}
                      onChange={(e) => setSizeIndex(parseInt(e.target.value))}
                      className="w-full h-2 bg-[#E5E5EA] rounded-lg appearance-none cursor-pointer accent-[#0071E3]"
                      disabled={!isSizeEnabled}
                    />
                    <div className="flex justify-between mt-3 px-1">
                      {SIZE_BUCKETS.map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-[#D1D1D6]" />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
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
                  Provide a list of specific company domains you want the AI to research. The agent will skip public search and exclusively analyze these targets.
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
              disabled={isScanning || (mode === "manual" && customDomainsText.trim().length === 0) || (mode === "icp" && Object.keys(selectedGeo).length === 0)}
            >
              {mode === "manual" ? "Import & Analyze Targets" : "Find Opportunities"}
            </Button>
          </div>

        </div>
      </main>

      {/* Interactive Loading Overlay */}
      {isScanning && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white border border-[#E5E5EA] shadow-2xl rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-[#F5F5F7] rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#0071E3] rounded-full border-t-transparent animate-spin"></div>
              <Globe className="text-[#0071E3] w-8 h-8 animate-pulse" />
            </div>
            
            <h3 className="text-2xl font-semibold text-[#1D1D1F] mb-2">
              {loadingStep === 1 && "Initializing Engine..."}
              {loadingStep === 2 && "Scouring the Web..."}
              {loadingStep === 3 && "Analyzing Company Data..."}
              {loadingStep === 4 && "Finalizing Results..."}
            </h3>
            
            <p className="text-[15px] text-[#4B5563] mb-8 max-w-[280px]">
              {loadingStep <= 2 && "The AI is searching Google to find companies matching your exact criteria."}
              {loadingStep === 3 && "Crawling websites and extracting firmographics, signals, and decision makers."}
              {loadingStep === 4 && "Redirecting to your dashboard..."}
            </p>

            <div className="w-full space-y-4 text-left">
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${loadingStep > 1 ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}>
                  {loadingStep > 1 && <Check size={12} className="text-white" />}
                </div>
                <span className={`text-[14px] ${loadingStep > 1 ? 'text-[#1D1D1F] font-medium' : 'text-[#86868B]'}`}>Booting AI Agents</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${loadingStep > 2 ? 'bg-[#34C759]' : (loadingStep === 2 ? 'border-2 border-[#0071E3]' : 'bg-[#E5E5EA]')}`}>
                  {loadingStep > 2 && <Check size={12} className="text-white" />}
                </div>
                <span className={`text-[14px] ${loadingStep > 2 ? 'text-[#1D1D1F] font-medium' : (loadingStep === 2 ? 'text-[#0071E3] font-semibold' : 'text-[#86868B]')}`}>Target Acquisition</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${loadingStep > 3 ? 'bg-[#34C759]' : (loadingStep === 3 ? 'border-2 border-[#0071E3]' : 'bg-[#E5E5EA]')}`}>
                  {loadingStep > 3 && <Check size={12} className="text-white" />}
                </div>
                <span className={`text-[14px] ${loadingStep > 3 ? 'text-[#1D1D1F] font-medium' : (loadingStep === 3 ? 'text-[#0071E3] font-semibold' : 'text-[#86868B]')}`}>Deep Intelligence Extraction</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* City/State Selection Modal */}
      {activeCountryModal && (
        <LocationSelectionModal 
          countryName={activeCountryModal.name}
          countryCode={activeCountryModal.isoCode}
          currentSelection={selectedGeo[activeCountryModal.name] || []}
          onClose={() => setActiveCountryModal(null)}
          onSave={(locations) => {
            setSelectedGeo(prev => ({
              ...prev,
              [activeCountryModal.name]: locations
            }));
            setActiveCountryModal(null);
          }}
        />
      )}
    </div>
  );
}

function LocationSelectionModal({ 
  countryName, 
  countryCode, 
  currentSelection, 
  onClose, 
  onSave 
}: { 
  countryName: string;
  countryCode: string;
  currentSelection: string[];
  onClose: () => void;
  onSave: (locations: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  // Initialize selection
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSelection));

  const isUS = countryCode === "US";
  const locationTypeLabel = isUS ? "States" : "Cities";
  
  const allLocations = useMemo(() => {
    return isUS ? (State.getStatesOfCountry("US") || []) : (City.getCitiesOfCountry(countryCode) || []);
  }, [countryCode, isUS]);
  
  const filteredLocations = useMemo(() => {
    if (!search.trim()) return allLocations;
    return allLocations.filter(loc => loc.name.toLowerCase().includes(search.toLowerCase()));
  }, [allLocations, search]);

  const isAllSelected = selected.has("ALL");

  const toggleAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(["ALL"]));
    }
  };

  const toggleLocation = (locName: string) => {
    const next = new Set(selected);
    if (next.has("ALL")) next.delete("ALL");

    if (next.has(locName)) {
      next.delete(locName);
    } else {
      next.add(locName);
    }
    setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-6 border-b border-[#E5E5EA]">
          <div>
            <h3 className="text-xl font-semibold text-[#1D1D1F]">Select {locationTypeLabel}</h3>
            <p className="text-sm text-[#86868B]">{countryName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F5F5F7] text-[#86868B] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" size={16} />
            <input 
              type="text"
              placeholder={`Search ${locationTypeLabel.toLowerCase()}...`}
              className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-transparent rounded-lg text-sm focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button 
            onClick={toggleAll}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#F5F5F7] transition-colors mb-2 text-left"
          >
            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isAllSelected ? "bg-[#0071E3] border-[#0071E3]" : "bg-white border-[#E5E5EA]"}`}>
              {isAllSelected && <Check size={14} className="text-white" />}
            </div>
            <span className="font-medium text-[#1D1D1F] text-sm">Search All {locationTypeLabel}</span>
          </button>

          <div className="h-[300px] overflow-y-auto border border-[#E5E5EA] rounded-xl scrollbar-thin">
            {filteredLocations.length > 0 ? (
              <>
                {filteredLocations.slice(0, 100).map((loc, idx) => {
                  const isChecked = isAllSelected || selected.has(loc.name);
                  return (
                    <button 
                      key={`${loc.name}-${idx}`}
                      onClick={() => toggleLocation(loc.name)}
                      className="flex items-center gap-3 w-full p-3 hover:bg-[#F9F9FB] transition-colors border-b border-[#E5E5EA] last:border-0 text-left"
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isChecked ? "bg-[#0071E3] border-[#0071E3]" : "bg-white border-[#E5E5EA]"}`}>
                        {isChecked && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm text-[#4B5563]">{loc.name}</span>
                    </button>
                  )
                })}
                {filteredLocations.length > 100 && (
                  <div className="p-4 text-center text-xs text-[#86868B] bg-[#F9F9FB]">
                    Showing 100 of {filteredLocations.length} {locationTypeLabel.toLowerCase()}. Use search to find specific {locationTypeLabel.toLowerCase()}.
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-[#86868B] text-sm">
                No {locationTypeLabel.toLowerCase()} found
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-[#E5E5EA] flex justify-end gap-3 bg-[#F9F9FB]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(Array.from(selected))}>
            Save Selection
          </Button>
        </div>
        
      </div>
    </div>
  );
}
