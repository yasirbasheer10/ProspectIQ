import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, glass, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "apple-card",
        hover && "cursor-pointer transition-all duration-200 hover:border-[#0071E3]/30 hover:shadow-apple-md hover:-translate-y-0.5",
        glass && "apple-glass",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-[#E5E5EA] px-6 py-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[15px] font-semibold text-[#1D1D1F]", className)}>{children}</h3>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

// ─── KPI Card ─────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  icon?: React.ElementType;
  iconColor?: string;
  suffix?: string;
  className?: string;
}

export function KpiCard({ title, value, delta, deltaPositive, icon: Icon, suffix, className }: KpiCardProps) {
  return (
    <Card className={cn("p-5 flex flex-col justify-between", className)}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-[13px] font-medium text-[#4B5563]">{title}</p>
        {Icon && (
          <div className="text-[#86868B]">
            <Icon size={18} strokeWidth={2} />
          </div>
        )}
      </div>
      
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight text-[#1D1D1F]">{value}</span>
          {suffix && <span className="text-sm font-medium text-[#86868B]">{suffix}</span>}
        </div>
        
        {delta && (
          <p className={cn("text-[13px] font-medium mt-1", deltaPositive ? "text-[#34C759]" : "text-[#FF3B30]")}>
            {deltaPositive ? "↑" : "↓"} {delta}
          </p>
        )}
      </div>
    </Card>
  );
}
