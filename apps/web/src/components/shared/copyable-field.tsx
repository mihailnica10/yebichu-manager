import { StatusDot } from "./status-dot";
import { CopyButton } from "./copy-button";

interface CopyableFieldProps {
  label: string;
  value: string;
  status?: "ok" | "warn" | "crit" | "idle" | "pulse";
}

export function CopyableField({ label, value, status }: CopyableFieldProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {status && <StatusDot status={status} size="sm" />}
        <code className="text-xs font-mono text-foreground/80">{value}</code>
        <CopyButton value={value} label={`Copy ${label}`} size="xs" />
      </div>
    </div>
  );
}
