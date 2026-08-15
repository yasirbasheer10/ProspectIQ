import { cn } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const SIZES = {
  sm: { ring: 44, stroke: 3, fontSize: "text-[12px]", r: 17 },
  md: { ring: 64, stroke: 4, fontSize: "text-[15px]", r: 26 },
  lg: { ring: 88, stroke: 5, fontSize: "text-[20px]", r: 36 },
};

export function ScoreRing({ score, size = "md", showLabel, className }: ScoreRingProps) {
  const { ring, stroke, fontSize, r } = SIZES[size];
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  const getColor = (s: number) => {
    if (s >= 80) return "#0071E3"; // Apple Blue
    if (s >= 65) return "#34C759"; // Green
    if (s >= 50) return "#FFCC00"; // Yellow
    if (s >= 35) return "#FF9500"; // Orange
    return "#FF3B30"; // Red
  };

  const color = getColor(score);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: ring, height: ring }}>
        <svg width={ring} height={ring} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            fill="none"
            stroke="#E5E5EA"
            strokeWidth={stroke}
          />
          {/* Score arc */}
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        {/* Score text */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center font-semibold tracking-tight",
            fontSize
          )}
          style={{ color }}
        >
          {Math.round(score)}
        </div>
      </div>
      {showLabel && (
        <span className="text-[11px] font-medium text-[#86868B] tracking-wide">SCORE</span>
      )}
    </div>
  );
}

// ─── Score Bar (horizontal) ───────────────────────────────

interface ScoreBarProps {
  label: string;
  score: number;
  weight?: number;
  className?: string;
}

export function ScoreBar({ label, score, weight, className }: ScoreBarProps) {
  const getColor = (s: number) => {
    if (s >= 80) return "bg-[#0071E3]";
    if (s >= 65) return "bg-[#34C759]";
    if (s >= 50) return "bg-[#FFCC00]";
    if (s >= 35) return "bg-[#FF9500]";
    return "bg-[#FF3B30]";
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-[#4B5563]">{label}</span>
          {weight !== undefined && (
            <span className="text-[11px] text-[#86868B]">{(weight * 100).toFixed(0)}%</span>
          )}
        </div>
        <span className="text-[13px] font-semibold text-[#1D1D1F]">{Math.round(score)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[#E5E5EA]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
