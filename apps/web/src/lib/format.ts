export function timeFormatter(t: number, range: string) {
  const d = new Date(t);
  if (range === "1h" || range === "6h")
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "24h") return `${String(d.getHours()).padStart(2, "0")}:00`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  const kb = bytes / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Format bytes into human-readable size */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format a relative time string from a timestamp or ISO date */
export function relativeTime(date: string | number | Date): string {
  const now = Date.now();
  const then = typeof date === "number" ? date : new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Format running time from a start timestamp */
export function getRunningTime(createdAt?: string | number | Date): string {
  if (!createdAt) return "";
  const start = typeof createdAt === "number" ? createdAt : new Date(createdAt).getTime();
  const diff = Date.now() - start;
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format price with symbol suffix */
export function formatPrice(value: number, symbol?: string): string {
  const formatted = value.toFixed(symbol === "BTCUSD" || symbol === "ETHUSD" ? 2 : 5);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

/** Format profit/loss with sign */
export function formatProfit(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

/** Convert a 0-100 percent to severity level */
export function severityFromPercent(pct: number): "ok" | "warn" | "crit" {
  if (pct >= 90) return "crit";
  if (pct >= 70) return "warn";
  return "ok";
}
