import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "ok" | "warn" | "crit" | "idle" | "pulse";
  size?: "sm" | "default";
  label?: string;
}

const colorMap = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  crit: "bg-red-500",
  idle: "bg-muted-foreground/40",
  pulse: "bg-yellow-500 animate-pulse",
};

const sizeMap = { sm: "size-1.5", default: "size-2" };

export function StatusDot({ status, size = "default", label }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={cn("inline-block rounded-full shrink-0", colorMap[status], sizeMap[size])} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
