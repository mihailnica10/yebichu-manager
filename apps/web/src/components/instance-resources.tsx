"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useInstanceMetrics } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { formatBytes, timeFormatter } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { ActivityIcon, CpuIcon, HardDriveIcon, MemoryStickIcon, WifiIcon } from "lucide-react";
import * as React from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

interface MetricsPoint {
  cpuPercent: number;
  memoryPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pidsCurrent: number;
  recordedAt: number;
}

const RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

const cpuChartConfig = { cpu: { label: "CPU %", color: "var(--color-foreground)" } } satisfies ChartConfig;
const memChartConfig = {
  memory: { label: "Memory %", color: "var(--color-foreground)" },
} satisfies ChartConfig;
const netChartConfig = {
  netRx: { label: "Rx", color: "var(--color-foreground)" },
  netTx: { label: "Tx", color: "var(--color-foreground)" },
} satisfies ChartConfig;
const ioChartConfig = {
  blockR: { label: "Read", color: "var(--color-foreground)" },
  blockW: { label: "Write", color: "var(--color-foreground)" },
} satisfies ChartConfig;

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`ispark-${color.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          dataKey="v"
          type="natural"
          fill={`url(#ispark-${color.replace(/\W/g, "")})`}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ChartDataPoint {
  time: string;
  rawTime: number;
  cpu: number;
  memory: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  netRx: number;
  netTx: number;
  blockR: number;
  blockW: number;
  pids: number;
}

function mapToChartPoint(m: MetricsPoint, range: string): ChartDataPoint {
  return {
    time: timeFormatter(m.recordedAt, range),
    rawTime: m.recordedAt,
    cpu: m.cpuPercent ?? 0,
    memory: m.memoryPercent ?? 0,
    memoryUsageBytes: m.memoryUsageBytes ?? 0,
    memoryLimitBytes: m.memoryLimitBytes ?? 0,
    netRx: m.networkRxBytes ?? 0,
    netTx: m.networkTxBytes ?? 0,
    blockR: m.blockReadBytes ?? 0,
    blockW: m.blockWriteBytes ?? 0,
    pids: m.pidsCurrent ?? 0,
  };
}

export function InstanceResources({ name }: { name: string }) {
  const [range, setRange] = React.useState("1h");
  const [chartData, setChartData] = React.useState<ChartDataPoint[]>([]);
  const prevRangeRef = React.useRef(range);

  const { data: metrics } = useQuery({
    queryKey: ["instance-metrics", name, range],
    queryFn: async () => {
      const res = await api.get<MetricsPoint[]>(`/instances/${name}/metrics?range=${range}`);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  React.useEffect(() => {
    if (!metrics) return;
    const sorted = [...metrics].sort((a, b) => Number(a.recordedAt) - Number(b.recordedAt));
    if (prevRangeRef.current !== range) {
      prevRangeRef.current = range;
      setChartData(sorted.map((m) => mapToChartPoint(m, range)));
    } else {
      setChartData((prev) => {
        const existing = new Set(prev.map((p) => p.rawTime));
        const newPoints = sorted.filter((m) => !existing.has(m.recordedAt));
        if (newPoints.length === 0) return prev;
        const merged = [...prev, ...newPoints.map((m) => mapToChartPoint(m, range))];
        merged.sort((a, b) => a.rawTime - b.rawTime);
        return merged;
      });
    }
  }, [metrics, range]);

  const liveMetrics = useInstanceMetrics(name);

  React.useEffect(() => {
    if (!liveMetrics) return;
    setChartData((prev) => {
      if (prev.some((p) => p.rawTime === liveMetrics.recordedAt)) return prev;
      const point = {
        time: timeFormatter(liveMetrics.recordedAt ?? Date.now(), range),
        rawTime: liveMetrics.recordedAt ?? Date.now(),
        cpu: liveMetrics.cpuPercent ?? 0,
        memory: liveMetrics.memoryPercent ?? 0,
        memoryUsageBytes: liveMetrics.memoryUsageBytes ?? 0,
        memoryLimitBytes: liveMetrics.memoryLimitBytes ?? 0,
        netRx: liveMetrics.networkRxBytes ?? 0,
        netTx: liveMetrics.networkTxBytes ?? 0,
        blockR: liveMetrics.blockReadBytes ?? 0,
        blockW: liveMetrics.blockWriteBytes ?? 0,
        pids: liveMetrics.pidsCurrent ?? 0,
      };
      const rawTime = liveMetrics.recordedAt ?? Date.now();
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
  }, [liveMetrics, range]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const sparkData = React.useMemo(() => {
    return {
      cpu: chartData.map((d) => ({ v: d.cpu })),
      mem: chartData.map((d) => ({ v: d.memory })),
      net: chartData.map((d) => ({ v: (d.netRx + d.netTx) / 1024 / 1024 })),
      io: chartData.map((d) => ({ v: (d.blockR + d.blockW) / 1024 / 1024 })),
    };
  }, [chartData]);

  const noData = chartData.length === 0;

  const cpuChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <ChartContainer config={cpuChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <Line dataKey="cpu" type="natural" stroke="var(--color-cpu)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    );
  }, [noData, chartData.length, chartData[0]?.rawTime, chartData[chartData.length - 1]?.rawTime]);

  const memChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <ChartContainer config={memChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fillInstMem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-memory)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-memory)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={32} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area dataKey="memory" type="natural" fill="url(#fillInstMem)" stroke="var(--color-memory)" strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
    );
  }, [noData, chartData.length, chartData[0]?.rawTime, chartData[chartData.length - 1]?.rawTime]);

  const netChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <ChartContainer config={netChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fillRx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-netRx)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-netRx)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillTx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-netTx)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-netTx)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={40} tickFormatter={(v: number) => formatBytes(v)} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area dataKey="netRx" type="natural" fill="url(#fillRx)" stroke="var(--color-netRx)" strokeWidth={1.5} />
          <Area dataKey="netTx" type="natural" fill="url(#fillTx)" stroke="var(--color-netTx)" strokeWidth={1.5} />
        </AreaChart>
      </ChartContainer>
    );
  }, [noData, chartData.length, chartData[0]?.rawTime, chartData[chartData.length - 1]?.rawTime]);

  const ioChartNode = React.useMemo((): React.ReactNode => {
    if (noData) return <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">Waiting for data...</div>;
    return (
      <ChartContainer config={ioChartConfig} className="min-h-[140px] w-full md:min-h-[180px] [&_.recharts-cartesian-grid-horizontal]:stroke-muted-foreground/15 [&_.recharts-cartesian-grid-vertical]:stroke-muted-foreground/10 [&_.recharts-text]:fill-muted-foreground">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fillRead" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-blockR)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-blockR)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillWrite" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-blockW)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-blockW)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={6} minTickGap={40} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} tickMargin={4} fontSize={11} width={40} tickFormatter={(v: number) => formatBytes(v)} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area dataKey="blockR" type="natural" fill="url(#fillRead)" stroke="var(--color-blockR)" strokeWidth={1.5} />
          <Area dataKey="blockW" type="natural" fill="url(#fillWrite)" stroke="var(--color-blockW)" strokeWidth={1.5} />
        </AreaChart>
      </ChartContainer>
    );
  }, [noData, chartData.length, chartData[0]?.rawTime, chartData[chartData.length - 1]?.rawTime]);

  return (
    <div className="space-y-4">
      {latest && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <CpuIcon className="size-3" /> CPU
              </CardDescription>
              <CardTitle className="text-xl tabular-nums">{latest.cpu}%</CardTitle>
            </CardHeader>
            <Sparkline data={sparkData.cpu} color="var(--color-foreground)" />
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <MemoryStickIcon className="size-3" /> Memory
              </CardDescription>
              <CardTitle className="text-xl tabular-nums">{latest.memory}%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {formatBytes(latest.memoryUsageBytes)} / {formatBytes(latest.memoryLimitBytes)}
            </CardContent>
            <Sparkline data={sparkData.mem} color="var(--color-foreground)" />
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <WifiIcon className="size-3" /> Network
              </CardDescription>
              <CardTitle className="text-xl tabular-nums text-xs font-normal pt-1 space-y-1">
                <div>↓ {formatBytes(latest.netRx)}</div>
                <div>↑ {formatBytes(latest.netTx)}</div>
              </CardTitle>
            </CardHeader>
            <Sparkline data={sparkData.net} color="var(--color-foreground)" />
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <HardDriveIcon className="size-3" /> Disk I/O
              </CardDescription>
              <CardTitle className="text-xl tabular-nums text-xs font-normal pt-1 space-y-1">
                <div>R: {formatBytes(latest.blockR)}</div>
                <div>W: {formatBytes(latest.blockW)}</div>
              </CardTitle>
            </CardHeader>
            <Sparkline data={sparkData.io} color="var(--color-foreground)" />
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <ActivityIcon className="size-3" /> Processes
              </CardDescription>
              <CardTitle className="text-xl tabular-nums">{latest.pids}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              Running processes
            </CardContent>
          </Card>
        </div>
      )}

      {!latest && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No metrics data yet. Data will appear within 30 seconds.
        </div>
      )}

      <div className="flex items-center justify-between px-1">
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
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CPU Usage</CardTitle>
            <CardDescription>CPU utilization over time</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {cpuChartNode}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Memory Usage</CardTitle>
            <CardDescription>RAM consumption over time</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {memChartNode}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Network</CardTitle>
            <CardDescription>Rx / Tx over time</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {netChartNode}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Block I/O</CardTitle>
            <CardDescription>Disk read / write over time</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {ioChartNode}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
