import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F5F5F7]">
          <Icon size={32} className="text-[#86868B]" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-[#1D1D1F]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[#86868B]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
