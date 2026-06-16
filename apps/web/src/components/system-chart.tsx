"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
  cpu: { label: "CPU %", color: "var(--color-foreground)" },
} satisfies ChartConfig;

const memChartConfig = {
  memory: { label: "Memory %", color: "var(--color-foreground)" },
} satisfies ChartConfig;

const diskChartConfig = {
  disk: { label: "Disk %", color: "var(--color-foreground)" },
} satisfies ChartConfig;

const loadChartConfig = {
  load1m: { label: "Load 1m", color: "var(--color-foreground)" },
  load5m: { label: "Load 5m", color: "var(--color-foreground)" },
  load15m: { label: "Load 15m", color: "var(--color-foreground)" },
} satisfies ChartConfig;

type ExpandedState = {
  cpu: boolean;
  memory: boolean;
  disk: boolean;
  load: boolean;
};

function statusColor(value: number): string {
  if (value >= 90) return "text-red-500";
  if (value >= 70) return "text-yellow-500";
  return "text-green-500";
}

export function SystemChart() {
  const { isConnected } = useSocket();
  const metrics = useSystemMetrics();
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
      } catch {
        if (mounted) setLoading(false);
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

  const cpuChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={cpuChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
          <LineChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Line dataKey="cpu" type="natural" stroke="var(--color-cpu)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Avg: {Math.round(data.reduce((s, p) => s + p.cpu, 0) / data.length)}%</span>
            <span>Max: {Math.round(Math.max(...data.map((p) => p.cpu)))}%</span>
            <span>Current: {Math.round(latest.cpu)}%</span>
          </div>
        )}
      </>
    );
  }, [noData, data.length, data[0]?.rawTime, data[data.length - 1]?.rawTime]);

  const memChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={memChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillMem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-memory)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-memory)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="memory" type="natural" fill="url(#fillMem)" stroke="var(--color-memory)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Used: {formatBytes(latest.memoryUsedBytes)} / {formatBytes(latest.memoryTotalBytes)}</span>
            <span>Current: {Math.round(latest.memory)}%</span>
          </div>
        )}
      </>
    );
  }, [noData, data.length, data[0]?.rawTime, data[data.length - 1]?.rawTime]);

  const diskChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={diskChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillDisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-disk)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-disk)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="disk" type="natural" fill="url(#fillDisk)" stroke="var(--color-disk)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>Used: {formatBytes(latest.diskUsedBytes)} / {formatBytes(latest.diskTotalBytes)}</span>
            <span>Current: {Math.round(latest.disk)}%</span>
          </div>
        )}
      </>
    );
  }, [noData, data.length, data[0]?.rawTime, data[data.length - 1]?.rawTime]);

  const loadChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <>
        <ChartContainer config={loadChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
          <LineChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Line dataKey="load1m" type="natural" stroke="var(--color-load1m)" strokeWidth={2} dot={false} />
            <Line dataKey="load5m" type="natural" stroke="var(--color-load5m)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line dataKey="load15m" type="natural" stroke="var(--color-load15m)" strokeWidth={1} dot={false} strokeDasharray="2 2" />
          </LineChart>
        </ChartContainer>
        {latest && (
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground px-1">
            <span>1m: {latest.load1m.toFixed(1)}</span>
            <span>5m: {latest.load5m.toFixed(1)}</span>
            <span>15m: {latest.load15m.toFixed(1)}</span>
          </div>
        )}
      </>
    );
  }, [noData, data.length, data[0]?.rawTime, data[data.length - 1]?.rawTime]);

  function renderChartCard(
    key: keyof ExpandedState,
    title: string,
    desc: string,
    chart: React.ReactNode,
    summary: React.ReactNode,
  ) {
    return (
      <Collapsible
        open={expanded[key]}
        onOpenChange={(v) => setExpanded((prev) => ({ ...prev, [key]: v }))}
      >
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1">
                  {expanded[key] ? (
                    <ChevronUpIcon className="size-4" />
                  ) : (
                    <ChevronDownIcon className="size-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
            {!expanded[key] && summary}
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="px-2 pb-4">{chart}</CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Metrics</CardTitle>
          <CardDescription>Loading historical data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            Loading...
          </div>
        </CardContent>
      </Card>
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
              className="h-7 text-xs px-2"
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <span
            className={`inline-block size-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span>{isConnected ? "Live" : "Disconnected"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {renderChartCard(
          "cpu",
          "CPU Usage",
          "Processor utilization over time",
          cpuChartNode,
          latest && (
            <div className="flex items-center gap-2 mt-2">
              <span className={`size-2 rounded-full ${statusColor(latest.cpu)}`} />
              <span className="text-xs font-medium tabular-nums">
                Current: {Math.round(latest.cpu)}%
              </span>
            </div>
          ),
        )}

        {renderChartCard(
          "memory",
          "Memory Usage",
          "RAM consumption over time",
          memChartNode,
          latest && (
            <div className="flex items-center gap-2 mt-2">
              <span className={`size-2 rounded-full ${statusColor(latest.memory)}`} />
              <span className="text-xs font-medium tabular-nums">
                {Math.round(latest.memory)}% used
              </span>
            </div>
          ),
        )}

        {renderChartCard(
          "disk",
          "Disk Usage",
          "Storage consumption over time",
          diskChartNode,
          latest && (
            <div className="flex items-center gap-2 mt-2">
              <span className={`size-2 rounded-full ${statusColor(latest.disk)}`} />
              <span className="text-xs font-medium tabular-nums">
                {Math.round(latest.disk)}% used
              </span>
            </div>
          ),
        )}

        {renderChartCard(
          "load",
          "System Load",
          "CPU load average (1m / 5m / 15m)",
          loadChartNode,
          latest && (
            <div className="flex items-center gap-2 mt-2">
              <span className="size-2 rounded-full text-green-500" />
              <span className="text-xs font-medium tabular-nums">
                1m: {latest.load1m.toFixed(1)}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
