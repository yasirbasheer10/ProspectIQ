import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ElementType;
  iconRight?: React.ElementType;
}

const VARIANT_STYLES = {
  primary:
    "bg-[#0071E3] text-white hover:bg-[#0077ED] shadow-sm",
  secondary:
    "bg-white text-[#4B5563] border border-[#E5E5EA] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]",
  ghost:
    "bg-transparent text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]",
  danger:
    "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20 hover:bg-[#FF3B30]/20",
  outline:
    "bg-transparent text-[#4B5563] border border-[#E5E5EA] hover:border-[#86868B] hover:text-[#1D1D1F]",
};

const SIZE_STYLES = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-md",
  md: "h-9 px-4 text-[13px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-[14px] gap-2 rounded-lg",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading,
  icon: Icon,
  iconRight: IconRight,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        Icon && <Icon size={size === "sm" ? 14 : 16} className="shrink-0" strokeWidth={2} />
      )}
      {children}
      {!loading && IconRight && <IconRight size={size === "sm" ? 14 : 16} className="shrink-0" strokeWidth={2} />}
    </button>
  );
}
