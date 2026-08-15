import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-[#F5F5F7] text-[#4B5563] border-[#E5E5EA]",
  success: "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20",
  warning: "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20",
  danger: "bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20",
  info: "bg-[#0071E3]/10 text-[#0071E3] border-[#0071E3]/20",
  purple: "bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20",
  outline: "bg-transparent text-[#4B5563] border-[#E5E5EA]",
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: "bg-[#86868B]",
  success: "bg-[#34C759]",
  warning: "bg-[#FF9500]",
  danger: "bg-[#FF3B30]",
  info: "bg-[#0071E3]",
  purple: "bg-[#5856D6]",
  outline: "bg-[#86868B]",
};

export function Badge({ children, variant = "default", size = "sm", className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT_COLORS[variant])} />
      )}
      {children}
    </span>
  );
}

// ─── Status Badge helpers ─────────────────────────────────

export function CompanyStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    DISCOVERED: "outline",
    RESEARCHING: "warning",
    RESEARCHED: "info",
    QUALIFIED: "success",
    DISQUALIFIED: "danger",
    IN_OUTREACH: "purple",
    CONVERTED: "success",
    SUPPRESSED: "default",
  };
  const labels: Record<string, string> = {
    DISCOVERED: "Discovered",
    RESEARCHING: "Researching",
    RESEARCHED: "Researched",
    QUALIFIED: "Qualified",
    DISQUALIFIED: "Disqualified",
    IN_OUTREACH: "In Outreach",
    CONVERTED: "Converted",
    SUPPRESSED: "Suppressed",
  };
  return <Badge variant={map[status] ?? "default"} dot>{labels[status] ?? status}</Badge>;
}

export function OpportunityStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    NEW: "info",
    REVIEWING: "warning",
    APPROVED: "success",
    REJECTED: "danger",
    IN_OUTREACH: "purple",
    CONVERTED: "success",
    LOST: "default",
  };
  const labels: Record<string, string> = {
    NEW: "New",
    REVIEWING: "Reviewing",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    IN_OUTREACH: "In Outreach",
    CONVERTED: "Converted",
    LOST: "Lost",
  };
  return <Badge variant={map[status] ?? "default"} dot>{labels[status] ?? status}</Badge>;
}
