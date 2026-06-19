"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSocket, useSystemMetrics } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { formatBytes, timeFormatter } from "@/lib/format";

const RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

interface RawPoint {
  cpuPercent: number;
  memoryUsedPercent: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  diskUsedPercent: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  load1m: number;
  load5m: number;
  load15m: number;
  recordedAt: number;
}

interface DataPoint {
  time: string;
  rawTime: number;
  cpu: number;
  memory: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  disk: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  load1m: number;
  load5m: number;
  load15m: number;
}

const cpuChartConfig = {
  cpu: { label: "CPU", color: "var(--color-cpu)" },
} satisfies ChartConfig;

const memChartConfig = {
  memory: { label: "Memory", color: "var(--color-memory)" },
} satisfies ChartConfig;

const diskChartConfig = {
  disk: { label: "Disk", color: "var(--color-disk)" },
} satisfies ChartConfig;

const loadChartConfig = {
  load1m: { label: "1m", color: "var(--color-load1m)" },
  load5m: { label: "5m", color: "var(--color-load5m)" },
  load15m: { label: "15m", color: "var(--color-load15m)" },
} satisfies ChartConfig;

type ExpandedState = {
  cpu: boolean;
  memory: boolean;
  disk: boolean;
  load: boolean;
};

function statusColor(value: number): string {
  if (value >= 90) return "var(--color-destructive)";
  if (value >= 70) return "var(--color-warning)";
  return "var(--color-success)";
}

interface ChartSkeletonProps {
  height?: number;
}

function ChartSkeleton({ height = 180 }: ChartSkeletonProps) {
  return (
    <div className="relative overflow-hidden rounded-md" style={{ height }}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer" />
      <div className="absolute inset-0 flex items-end justify-between gap-1 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-muted animate-pulse rounded-sm"
            style={{
              height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 20}%`,
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  unit?: string;
  formatter?: (value: number) => string;
}

function CustomTooltip({ active, payload, label, unit = "%", formatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-md animate-in fade-in-0 zoom-in-95 duration-150">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">
            {formatter ? formatter(entry.value) : `${Math.round(entry.value)}${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  isExpanded,
  onToggle,
  summary,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  summary: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden transition-all duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 -mr-1 transition-transform duration-200 data-[state=open]:rotate-0"
            >
              {isExpanded ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </div>
        {!isExpanded && <div className="mt-2">{summary}</div>}
      </CardHeader>
      <CollapsibleContent
        className="data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down"
      >
        <CardContent className="px-2 pb-4">{children}</CardContent>
      </CollapsibleContent>
    </Card>
  );
}

export function SystemChart() {
  const { isConnected } = useSocket();
  const { metrics } = useSystemMetrics();
  const [data, setData] = React.useState<DataPoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState("1h");
  const [expanded, setExpanded] = React.useState<ExpandedState>({
    cpu: true,
    memory: true,
    disk: true,
    load: true,
  });

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const initial = mq.matches;
    setExpanded({ cpu: initial, memory: initial, disk: initial, load: initial });
    const handler = (e: MediaQueryListEvent) => {
      const v = e.matches;
      setExpanded({ cpu: v, memory: v, disk: v, load: v });
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  React.useEffect(() => {
    setData([]);
    setLoading(true);
    let mounted = true;
    async function fetchHistory() {
      try {
        const res = await api.get<RawPoint[]>(`/system/metrics?range=${range}`);
        if (!mounted) return;
        const points = [...(res.data || [])]
          .sort((a, b) => Number(a.recordedAt) - Number(b.recordedAt))
          .map((p) => ({
            time: timeFormatter(p.recordedAt, range),
            rawTime: p.recordedAt,
            cpu: p.cpuPercent ?? 0,
            memory: p.memoryUsedPercent ?? 0,
            memoryUsedBytes: p.memoryTotalBytes - p.memoryAvailableBytes,
            memoryTotalBytes: p.memoryTotalBytes,
            disk: p.diskUsedPercent ?? 0,
            diskUsedBytes: p.diskTotalBytes - p.diskFreeBytes,
            diskTotalBytes: p.diskTotalBytes,
            load1m: p.load1m ?? 0,
            load5m: p.load5m ?? 0,
            load15m: p.load15m ?? 0,
          }));
        setData(points);
        setLoading(false);
      } catch (err) {
        if (mounted) { setLoading(false); setError(err instanceof Error ? err.message : "Failed to load chart data"); }
      }
    }
    fetchHistory();
    return () => {
      mounted = false;
    };
  }, [range]);

  const addPoint = React.useCallback(
    (sys: any) => {
      setData((prev) => {
        const rawTime = Number(sys.recordedAt ?? Date.now());
        if (prev.some((p) => p.rawTime === rawTime)) return prev;
        const point: DataPoint = {
          time: timeFormatter(rawTime, range),
          rawTime,
          cpu: sys.cpuPercent ?? 0,
          memory: sys.memoryUsedPercent ?? 0,
          memoryUsedBytes: (sys.memoryTotalBytes ?? 0) - (sys.memoryAvailableBytes ?? 0),
          memoryTotalBytes: sys.memoryTotalBytes ?? 0,
          disk: sys.diskUsedPercent ?? 0,
          diskUsedBytes: (sys.diskTotalBytes ?? 0) - (sys.diskFreeBytes ?? 0),
          diskTotalBytes: sys.diskTotalBytes ?? 0,
          load1m: sys.load1m ?? 0,
          load5m: sys.load5m ?? 0,
          load15m: sys.load15m ?? 0,
        };
        let lo = 0;
        let hi = prev.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (prev[mid].rawTime < rawTime) lo = mid + 1;
          else hi = mid;
        }
        if (lo < prev.length && prev[lo].rawTime === rawTime) return prev;
        const next = [...prev];
        next.splice(lo, 0, point);
        const maxPoints = range === "1h" ? 120 : range === "6h" ? 720 : 360;
        return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
      });
      setError(null);
    },
    [range],
  );

  React.useEffect(() => {
    if (!metrics || loading) return;
    addPoint(metrics);
  }, [metrics, addPoint, loading]);

  const latest = data.length > 0 ? data[data.length - 1] : null;
  const noData = data.length === 0;

  const avgCpu = data.length > 0 ? Math.round(data.reduce((s, p) => s + p.cpu, 0) / data.length) : 0;
  const maxCpu = data.length > 0 ? Math.round(Math.max(...data.map((p) => p.cpu))) : 0;

  const cpuChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={cpuChartConfig} className="min-h-[140px] w-full md:min-h-[180px]">
          <LineChart data={data}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cpu)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-cpu)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={40}
              fontSize={11}
              fill="var(--muted-foreground)"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={11}
              width={32}
              fill="var(--muted-foreground)"
            />
            <ChartTooltip
              cursor={false}
              content={
                <CustomTooltip
                  unit="%"
                  formatter={(v) => `${Math.round(v)}%`}
                />
              }
            />
            <Line
              dataKey="cpu"
              type="natural"
              stroke="var(--color-cpu)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-cpu)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </LineChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Avg: <span className="text-foreground font-medium">{avgCpu}%</span></span>
            <span>Max: <span className="text-foreground font-medium">{maxCpu}%</span></span>
            <span>Current: <span className="text-foreground font-medium">{Math.round(latest.cpu)}%</span></span>
          </div>
        )}
      </>
    );
  }, [noData, data, latest, avgCpu, maxCpu]);

  const memChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={memChartConfig} className="min-h-[140px] w-full md:min-h-[180px]">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillMem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-memory)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-memory)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={40}
              fontSize={11}
              fill="var(--muted-foreground)"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={11}
              width={32}
              fill="var(--muted-foreground)"
            />
            <ChartTooltip
              cursor={false}
              content={
                <CustomTooltip
                  unit="%"
                  formatter={(v) => `${Math.round(v)}%`}
                />
              }
            />
            <Area
              dataKey="memory"
              type="natural"
              fill="url(#fillMem)"
              stroke="var(--color-memory)"
              strokeWidth={2}
              activeDot={{ r: 4, fill: "var(--color-memory)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Used: <span className="text-foreground font-medium">{formatBytes(latest.memoryUsedBytes)}</span> / {formatBytes(latest.memoryTotalBytes)}</span>
            <span>Current: <span className="text-foreground font-medium">{Math.round(latest.memory)}%</span></span>
          </div>
        )}
      </>
    );
  }, [noData, data, latest]);

  const diskChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={diskChartConfig} className="min-h-[140px] w-full md:min-h-[180px]">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillDisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-disk)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-disk)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={40}
              fontSize={11}
              fill="var(--muted-foreground)"
            />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={11}
              width={32}
              fill="var(--muted-foreground)"
            />
            <ChartTooltip
              cursor={false}
              content={
                <CustomTooltip
                  unit="%"
                  formatter={(v) => `${Math.round(v)}%`}
                />
              }
            />
            <Area
              dataKey="disk"
              type="natural"
              fill="url(#fillDisk)"
              stroke="var(--color-disk)"
              strokeWidth={2}
              activeDot={{ r: 4, fill: "var(--color-disk)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Used: <span className="text-foreground font-medium">{formatBytes(latest.diskUsedBytes)}</span> / {formatBytes(latest.diskTotalBytes)}</span>
            <span>Current: <span className="text-foreground font-medium">{Math.round(latest.disk)}%</span></span>
          </div>
        )}
      </>
    );
  }, [noData, data, latest]);

  const loadChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={loadChartConfig} className="min-h-[140px] w-full md:min-h-[180px]">
          <LineChart data={data}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={40}
              fontSize={11}
              fill="var(--muted-foreground)"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={11}
              width={32}
              fill="var(--muted-foreground)"
            />
            <ChartTooltip
              cursor={false}
              content={
                <CustomTooltip
                  unit=""
                  formatter={(v) => v.toFixed(2)}
                />
              }
            />
            <Line
              dataKey="load1m"
              type="natural"
              stroke="var(--color-load1m)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-load1m)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            <Line
              dataKey="load5m"
              type="natural"
              stroke="var(--color-load5m)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 2"
              activeDot={{ r: 3, fill: "var(--color-load5m)", stroke: "var(--background)", strokeWidth: 2 }}
            />
            <Line
              dataKey="load15m"
              type="natural"
              stroke="var(--color-load15m)"
              strokeWidth={1}
              dot={false}
              strokeDasharray="2 2"
              activeDot={{ r: 2, fill: "var(--color-load15m)", stroke: "var(--background)", strokeWidth: 2 }}
            />
          </LineChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>1m: <span className="text-foreground font-medium">{latest.load1m.toFixed(2)}</span></span>
            <span>5m: <span className="text-foreground font-medium">{latest.load5m.toFixed(2)}</span></span>
            <span>15m: <span className="text-foreground font-medium">{latest.load15m.toFixed(2)}</span></span>
          </div>
        )}
      </>
    );
  }, [noData, data, latest]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <div key={r.value} className="h-7 w-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
            <div className="h-3 w-16 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {["CPU Usage", "Memory Usage", "Disk Usage", "System Load"].map((title) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-5 w-28 bg-muted animate-pulse rounded mb-1" />
                    <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ChartSkeleton height={180} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-nowrap [&::-webkit-scrollbar]:hidden">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2 transition-all"
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <span
            className={`inline-block size-2 rounded-full transition-colors ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span>{isConnected ? "Live" : "Disconnected"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard
          title="CPU Usage"
          description="Processor utilization over time"
          isExpanded={expanded.cpu}
          onToggle={() => setExpanded((prev) => ({ ...prev, cpu: !prev.cpu }))}
          summary={
            latest && (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: statusColor(latest.cpu) }} />
                <span className="text-xs font-medium tabular-nums">
                  {Math.round(latest.cpu)}%
                </span>
              </div>
            )
          }
        >
          {cpuChartNode}
        </ChartCard>

        <ChartCard
          title="Memory Usage"
          description="RAM consumption over time"
          isExpanded={expanded.memory}
          onToggle={() => setExpanded((prev) => ({ ...prev, memory: !prev.memory }))}
          summary={
            latest && (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: statusColor(latest.memory) }} />
                <span className="text-xs font-medium tabular-nums">
                  {Math.round(latest.memory)}% used
                </span>
              </div>
            )
          }
        >
          {memChartNode}
        </ChartCard>

        <ChartCard
          title="Disk Usage"
          description="Storage consumption over time"
          isExpanded={expanded.disk}
          onToggle={() => setExpanded((prev) => ({ ...prev, disk: !prev.disk }))}
          summary={
            latest && (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: statusColor(latest.disk) }} />
                <span className="text-xs font-medium tabular-nums">
                  {Math.round(latest.disk)}% used
                </span>
              </div>
            )
          }
        >
          {diskChartNode}
        </ChartCard>

        <ChartCard
          title="System Load"
          description="CPU load average (1m / 5m / 15m)"
          isExpanded={expanded.load}
          onToggle={() => setExpanded((prev) => ({ ...prev, load: !prev.load }))}
          summary={
            latest && (
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-load1m)" }} />
                <span className="text-xs font-medium tabular-nums">
                  {latest.load1m.toFixed(2)}
                </span>
              </div>
            )
          }
        >
          {loadChartNode}
        </ChartCard>
      </div>
    </div>
  );
}