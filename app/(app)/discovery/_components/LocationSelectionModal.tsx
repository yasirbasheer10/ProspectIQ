"use client";

import { useMemo, useState } from "react";
import { City, State } from "country-state-city";
import { Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Rendering more than this at once is what made the modal slow for large countries. */
const VISIBLE_LIMIT = 100;

export function LocationSelectionModal({
  countryName,
  countryCode,
  currentSelection,
  onClose,
  onSave,
}: {
  countryName: string;
  countryCode: string;
  currentSelection: string[];
  onClose: () => void;
  onSave: (locations: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(currentSelection));

  const isUS = countryCode === "US";
  const locationTypeLabel = isUS ? "States" : "Cities";

  const allLocations = useMemo(
    () => (isUS ? State.getStatesOfCountry("US") || [] : City.getCitiesOfCountry(countryCode) || []),
    [countryCode, isUS]
  );

  const filteredLocations = useMemo(() => {
    if (!search.trim()) return allLocations;
    return allLocations.filter((loc) => loc.name.toLowerCase().includes(search.toLowerCase()));
  }, [allLocations, search]);

  const isAllSelected = selected.has("ALL");

  const toggleAll = () => setSelected(isAllSelected ? new Set() : new Set(["ALL"]));

  const toggleLocation = (locName: string) => {
    const next = new Set(selected);
    if (next.has("ALL")) next.delete("ALL");
    if (next.has(locName)) next.delete(locName);
    else next.add(locName);
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
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-[#F5F5F7] text-[#86868B] transition-colors"
          >
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={toggleAll}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#F5F5F7] transition-colors mb-2 text-left"
          >
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                isAllSelected ? "bg-[#0071E3] border-[#0071E3]" : "bg-white border-[#E5E5EA]"
              }`}
            >
              {isAllSelected && <Check size={14} className="text-white" />}
            </div>
            <span className="font-medium text-[#1D1D1F] text-sm">Search All {locationTypeLabel}</span>
          </button>

          <div className="h-[300px] overflow-y-auto border border-[#E5E5EA] rounded-xl scrollbar-thin">
            {filteredLocations.length > 0 ? (
              <>
                {filteredLocations.slice(0, VISIBLE_LIMIT).map((loc, idx) => {
                  const isChecked = isAllSelected || selected.has(loc.name);
                  return (
                    <button
                      key={`${loc.name}-${idx}`}
                      onClick={() => toggleLocation(loc.name)}
                      className="flex items-center gap-3 w-full p-3 hover:bg-[#F9F9FB] transition-colors border-b border-[#E5E5EA] last:border-0 text-left"
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          isChecked ? "bg-[#0071E3] border-[#0071E3]" : "bg-white border-[#E5E5EA]"
                        }`}
                      >
                        {isChecked && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm text-[#4B5563]">{loc.name}</span>
                    </button>
                  );
                })}
                {filteredLocations.length > VISIBLE_LIMIT && (
                  <div className="p-4 text-center text-xs text-[#86868B] bg-[#F9F9FB]">
                    Showing {VISIBLE_LIMIT} of {filteredLocations.length}{" "}
                    {locationTypeLabel.toLowerCase()}. Use search to find specific{" "}
                    {locationTypeLabel.toLowerCase()}.
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(Array.from(selected))}>
            Save Selection
          </Button>
        </div>
      </div>
    </div>
  );
}
