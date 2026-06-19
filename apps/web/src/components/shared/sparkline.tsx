import { useId } from "react";

interface SparklineProps {
  data: number[];
  height?: number;
  color?: string;
  strokeWidth?: number;
  showFill?: boolean;
}

export function Sparkline({
  data,
  height = 32,
  color = "var(--color-foreground)",
  strokeWidth = 1.5,
  showFill = true,
}: SparklineProps) {
  const id = useId();
  if (!data.length) return <div style={{ height }} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;

  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * height}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      className="w-full overflow-visible"
      style={{ height }}
    >
      <defs>
        <linearGradient id={`spark-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={showFill ? 0.2 : 0} />
          <stop offset="100%" stopColor={color} stopOpacity={showFill ? 0.02 : 0} />
        </linearGradient>
      </defs>
      {showFill && (
        <polyline
          fill={`url(#spark-fill-${id})`}
          stroke="none"
          points={`0,${height} ${points} ${w},${height}`}
        />
      )}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}