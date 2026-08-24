"use client";

import { X } from "lucide-react";

/**
 * The removable pill used for keywords, exclusions and selected countries.
 *
 * The same markup appeared three times in `DiscoveryClient` with only the colour
 * changing, and the three copies had already drifted — one was a `<span>`, one a
 * `<button>` with a nested click handler.
 */
export function TagPill({
  label,
  tone = "blue",
  onRemove,
  onClick,
}: {
  label: string;
  tone?: "blue" | "red";
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const toneClasses =
    tone === "red"
      ? "border-[#FF3B30] bg-[#FF3B30] text-white"
      : "border-[#0071E3] bg-[#0071E3] text-white";

  const Element = onClick ? "button" : "span";

  return (
    <Element
      onClick={onClick}
      className={`group flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-medium shadow-sm transition-all ${toneClasses}`}
    >
      {label}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${label}`}
          className="p-0.5 rounded-full hover:bg-black/20 transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
        >
          <X size={14} />
        </span>
      )}
    </Element>
  );
}

/** The card header (icon, title, hairline) repeated on all five ICP cards. */
export function CardHeader({
  icon: Icon,
  title,
  actions,
  spacing = "mb-4",
}: {
  icon: React.ElementType;
  title: string;
  actions?: React.ReactNode;
  spacing?: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon size={24} className="text-[#0071E3]" />
          <h3 className="text-[18px] font-medium text-[#1D1D1F]">{title}</h3>
        </div>
        {actions}
      </div>
      <div className={`h-px w-full bg-[#E5E5EA] ${spacing}`} />
    </>
  );
}

/** The square checkbox used by the industry list and the location modal. */
export function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-5 h-5 rounded-[4px] flex items-center justify-center shadow-sm transition-colors ${
        checked ? "bg-[#0071E3] border-none" : "border border-[#E5E5EA] bg-white group-hover:border-[#86868B]"
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
