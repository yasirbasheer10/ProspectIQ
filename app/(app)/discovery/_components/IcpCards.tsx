"use client";

import { Building, Users, Tag, Ban } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { INDUSTRIES, SIZE_BUCKETS } from "../constants";
import { CardHeader, CheckSquare, TagPill } from "./Primitives";

export function IndustryCard({
  industries,
  onToggle,
}: {
  industries: Record<string, boolean>;
  onToggle: (industry: string) => void;
}) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
      <CardHeader icon={Building} title="Industry" />
      <div className="space-y-3 max-h-[220px] overflow-y-auto scrollbar-thin">
        {INDUSTRIES.map((industry) => {
          const isChecked = industries[industry] || false;
          return (
            <label
              key={industry}
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => onToggle(industry)}
            >
              <CheckSquare checked={isChecked} />
              <span
                className={`text-[14px] font-medium transition-colors ${
                  isChecked ? "text-[#1D1D1F]" : "text-[#4B5563] group-hover:text-[#0071E3]"
                }`}
              >
                {industry}
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

export function SizeCard({
  isSizeEnabled,
  setIsSizeEnabled,
  sizeIndex,
  setSizeIndex,
}: {
  isSizeEnabled: boolean;
  setIsSizeEnabled: (v: boolean) => void;
  sizeIndex: number;
  setSizeIndex: (v: number) => void;
}) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-[#0071E3]" />
          <h3 className="text-[18px] font-medium text-[#1D1D1F]">Company Size</h3>
        </div>
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

      <div
        className={`flex-1 flex flex-col justify-center transition-opacity duration-300 ${
          isSizeEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
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
  );
}

export function KeywordsCard({
  keywords,
  keywordInput,
  setKeywordInput,
  addKeyword,
  removeKeyword,
}: {
  keywords: string[];
  keywordInput: string;
  setKeywordInput: (v: string) => void;
  addKeyword: () => void;
  removeKeyword: (kw: string) => void;
}) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
      <CardHeader icon={Tag} title="Keywords" />
      <p className="text-[13px] text-[#86868B] mb-3 leading-relaxed">
        Narrow the category, e.g. &quot;DTC skincare&quot; or &quot;subscription box&quot; instead of
        just E-commerce.
      </p>
      <input
        type="text"
        placeholder="Type a keyword and press Enter..."
        className="w-full px-4 py-2.5 bg-[#F5F5F7] border border-transparent rounded-lg text-sm focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all mb-3"
        value={keywordInput}
        onChange={(e) => setKeywordInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addKeyword();
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <TagPill key={kw} label={kw} tone="blue" onRemove={() => removeKeyword(kw)} />
        ))}
      </div>
    </Card>
  );
}

export function ExcludeCard({
  excludeKeywords,
  excludeInput,
  setExcludeInput,
  addExclude,
  removeExclude,
  suggestedExclusions,
  toggleSuggestedExclude,
  selectAllSuggested,
}: {
  excludeKeywords: string[];
  excludeInput: string;
  setExcludeInput: (v: string) => void;
  addExclude: (value?: string) => void;
  removeExclude: (name: string) => void;
  suggestedExclusions: { name: string; domain: string }[];
  toggleSuggestedExclude: (name: string) => void;
  selectAllSuggested: () => void;
}) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-apple-md hover:-translate-y-0.5 transition-all flex flex-col">
      <CardHeader icon={Ban} title="Exclude Companies" />
      <input
        type="text"
        placeholder="Type a company name and press Enter..."
        className="w-full px-4 py-2.5 bg-[#F5F5F7] border border-transparent rounded-lg text-sm focus:outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all mb-3"
        value={excludeInput}
        onChange={(e) => setExcludeInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addExclude();
          }
        }}
      />
      {excludeKeywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {excludeKeywords.map((name) => (
            <TagPill key={name} label={name} tone="red" onRemove={() => removeExclude(name)} />
          ))}
        </div>
      )}

      {suggestedExclusions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-[#86868B]">Suggested big players to exclude</span>
            <button
              onClick={selectAllSuggested}
              className="text-[13px] font-medium text-[#0071E3] hover:text-[#0062CC] transition-colors"
            >
              Select all
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto scrollbar-thin">
            {suggestedExclusions.map((company) => {
              const isSelected = excludeKeywords.includes(company.name);
              return (
                <button
                  key={company.name}
                  onClick={() => toggleSuggestedExclude(company.name)}
                  className={`px-3.5 py-1.5 rounded-full border text-[13px] font-medium transition-all ${
                    isSelected
                      ? "border-[#FF3B30] bg-[#FF3B30] text-white shadow-sm"
                      : "border-[#E5E5EA] bg-white text-[#4B5563] hover:border-[#86868B]"
                  }`}
                >
                  {company.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
