import { cn } from "@/lib/utils";

export const DEFAULT_RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

interface RangePickerProps {
  value: string;
  onChange: (value: string) => void;
  ranges?: readonly { label: string; value: string }[];
}

export function RangePicker({ value, onChange, ranges = DEFAULT_RANGES }: RangePickerProps) {
  return (
    <div className="flex items-center gap-1">
      {ranges.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-md transition-colors",
            value === r.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
