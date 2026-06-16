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
