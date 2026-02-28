"use client";

/**
 * Reusable ScoreRing SVG component — circular progress indicator for scores.
 * Extracted from app/score/page.tsx for reuse across profile and score pages.
 */

function scoreColor(score: number) {
  if (score < 50)
    return { text: "text-red-500", bg: "bg-red-500", hex: "#ef4444" };
  if (score < 70)
    return { text: "text-amber-500", bg: "bg-amber-500", hex: "#f59e0b" };
  return { text: "text-emerald-500", bg: "bg-emerald-500", hex: "#10b981" };
}

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  animated?: boolean;
  className?: string;
  label?: string;
}

export function ScoreRing({
  score,
  size = 160,
  stroke = 10,
  animated = true,
  className = "",
  label,
}: ScoreRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const colors = scoreColor(score);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-dark-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? offset : circumference}
          className={animated ? "animate-scoreReveal" : ""}
          style={
            {
              "--circumference": circumference,
              "--target-offset": offset,
              filter: `drop-shadow(0 0 8px ${colors.hex}40)`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-extrabold ${colors.text}`}
          style={{ fontSize: size * 0.22 }}
        >
          {score}
        </span>
        <span
          className="text-dark-400 font-medium"
          style={{ fontSize: size * 0.075 }}
        >
          {label || "/100"}
        </span>
      </div>
    </div>
  );
}

/** Utility: get color classes for a given score */
export { scoreColor };
