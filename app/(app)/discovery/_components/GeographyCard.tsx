"use client";

import { useMemo, useState } from "react";
import { Country } from "country-state-city";
import { Check, Globe, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DEFAULT_COUNTRIES } from "../constants";
import { CardHeader } from "./Primitives";

/** Countries are searched from the full global list; the pills are the shortlist. */
export function GeographyCard({
  selectedGeo,
  onOpenCountry,
  onRemoveCountry,
}: {
  selectedGeo: Record<string, string[]>;
  onOpenCountry: (country: { name: string; isoCode: string }) => void;
  onRemoveCountry: (countryName: string) => void;
}) {
  const [geoSearch, setGeoSearch] = useState("");

  const allGlobalCountries = useMemo(() => Country.getAllCountries(), []);

  const filteredCountries = useMemo(() => {
    if (!geoSearch.trim()) return [];
    return allGlobalCountries
      .filter((c) => c.name.toLowerCase().includes(geoSearch.toLowerCase()))
      .slice(0, 50);
  }, [geoSearch, allGlobalCountries]);

  // Defaults plus anything currently selected, so a searched-for country stays
  // visible as a pill after the search box is cleared.
  const displayedCountryNames = useMemo(
    () => Array.from(new Set([...DEFAULT_COUNTRIES, ...Object.keys(selectedGeo)])),
    [selectedGeo]
  );

  const openCountry = (countryName: string) => {
    const countryObj = allGlobalCountries.find((c) => c.name === countryName);
    if (!countryObj) return;
    onOpenCountry({ name: countryObj.name, isoCode: countryObj.isoCode });
    setGeoSearch("");
  };

  return (
    <Card className="md:col-span-2 p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all">
      <CardHeader icon={Globe} title="Geography" />

      <div className="mb-4 relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" size={16} />
          <input
            type="text"
            placeholder="Search any country globally..."
            className="w-full max-w-md pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-transparent rounded-lg text-sm focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all"
            value={geoSearch}
            onChange={(e) => setGeoSearch(e.target.value)}
          />
        </div>

        {geoSearch.trim().length > 0 && (
          <div className="absolute z-10 top-full mt-2 w-full max-w-md bg-white border border-[#E5E5EA] rounded-xl shadow-lg max-h-[300px] overflow-y-auto">
            {filteredCountries.length > 0 ? (
              <div className="py-2">
                {filteredCountries.map((c) => (
                  <button
                    key={c.isoCode}
                    onClick={() => openCountry(c.name)}
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
          const selection = selectedGeo[countryName];
          const isSelected = !!selection;
          const locationType = countryName === "United States" ? "States" : "Cities";

          let label = countryName;
          if (isSelected) {
            if (selection.includes("ALL")) {
              label = `${countryName} (All ${locationType})`;
            } else {
              const len = selection.length;
              label = `${countryName} (${
                len > 2 ? `${selection[0]}, ${selection[1]}, +${len - 2}` : selection.join(", ")
              })`;
            }
          }

          return (
            <button
              key={countryName}
              onClick={() => openCountry(countryName)}
              className={`group flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-medium transition-all ${
                isSelected
                  ? "border-[#0071E3] bg-[#0071E3] text-white shadow-sm hover:bg-[#0062CC]"
                  : "border-[#E5E5EA] bg-white text-[#4B5563] hover:border-[#86868B]"
              }`}
            >
              {label}
              {isSelected && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${countryName}`}
                  className="p-0.5 rounded-full hover:bg-black/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCountry(countryName);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveCountry(countryName);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
