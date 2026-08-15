import React, { useState } from "react";
import { X } from "lucide-react";

interface ChipInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function ChipInput({ label, value, onChange, placeholder }: ChipInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeChip = (indexToRemove: number) => {
    onChange(value.filter((_, i) => i !== indexToRemove));
  };

  return (
    <div className="w-full">
      <label className="block text-[13px] font-medium text-[#4B5563] mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2 items-center p-2 rounded-lg border border-[#E5E5EA] focus-within:border-[#0071E3] focus-within:ring-1 focus-within:ring-[#0071E3] transition-all bg-white min-h-[42px]">
        {value.map((chip, i) => (
          <div
            key={i}
            className="flex items-center gap-1 bg-[#F5F5F7] border border-[#E5E5EA] rounded-full px-3 py-1 text-[13px] font-medium text-[#1D1D1F]"
          >
            <span>{chip}</span>
            <button
              type="button"
              onClick={() => removeChip(i)}
              className="text-[#86868B] hover:text-[#1D1D1F] focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <input
          type="text"
          className="flex-1 min-w-[120px] bg-transparent text-[14px] text-[#1D1D1F] focus:outline-none"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
        />
      </div>
      <p className="text-[12px] text-[#86868B] mt-1">Press Enter or comma to add.</p>
    </div>
  );
}
