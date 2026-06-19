"use client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSystemMetrics } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { CpuIcon, HardDriveIcon, MemoryStickIcon, TimerIcon, TrendingUpIcon } from "lucide-react";
import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface HistoryPoint {
  cpuPercent: number;
  memoryUsedPercent: number;
  diskUsedPercent: number;
  load1m: number;
  recordedAt: number;
}

function Sparkline({
  data,
  dataKey,
  color,
  highColor,
}: {
  data: { v: number }[];
  dataKey: string;
  color: string;
  highColor?: string;
}) {
  if (data.length < 2) return null;
  const gradientColor = highColor || color;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientColor} stopOpacity={0.35} />
            <stop offset="50%" stopColor={gradientColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={gradientColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`spark-line-${dataKey}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={gradientColor} stopOpacity={0.5} />
            <stop offset="100%" stopColor={gradientColor} stopOpacity={1} />
          </linearGradient>
        </defs>
        <Area
          dataKey="v"
          type="natural"
          fill={`url(#spark-${dataKey})`}
          stroke={`url(#spark-line-${dataKey})`}
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SectionCards({ range: rangeProp = "1h" }: { range?: string }) {
  const { metrics: liveSys } = useSystemMetrics();

  const { data: history } = useQuery({
    queryKey: ["system-metrics-spark", rangeProp],
    queryFn: async () => {
      const res = await api.get<HistoryPoint[]>(`/system/metrics?range=${rangeProp}`);
      return res.data || [];
    },
    refetchInterval: 60_000,
  });

  const sparkData = React.useMemo(() => {
    if (!history)
      return {
        cpu: [] as { v: number }[],
        mem: [] as { v: number }[],
        disk: [] as { v: number }[],
        load: [] as { v: number }[],
      };
    const sorted = [...history].sort((a, b) => Number(a.recordedAt) - Number(b.recordedAt));
    const step = Math.max(1, Math.floor(sorted.length / 60));
    const sampled = sorted.filter((_, i) => i % step === 0);
    return {
      cpu: sampled.map((p) => ({ v: p.cpuPercent ?? 0 })),
      mem: sampled.map((p) => ({ v: p.memoryUsedPercent ?? 0 })),
      disk: sampled.map((p) => ({ v: p.diskUsedPercent ?? 0 })),
      load: sampled.map((p) => ({ v: p.load1m ?? 0 })),
    };
  }, [history]);

  const trend = React.useCallback((arr: { v: number }[]) => {
    if (arr.length < 2) return null;
    const first = arr[0].v;
    const last = arr[arr.length - 1].v;
    if (first === 0) return null;
    return (((last - first) / first) * 100).toFixed(1);
  }, []);

  const cpuTrend = trend(sparkData.cpu);
  const memTrend = trend(sparkData.mem);
  const diskTrend = trend(sparkData.disk);

  return (
    <div className="grid grid-cols-2 gap-4 px-4 lg:px-6 md:grid-cols-4">
      <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-card to-card/80 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 *:data-[slot=card]:bg-transparent *:data-[slot=card]:shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0 relative">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1 text-muted-foreground/80">
              <CpuIcon className="size-3 text-primary" /> CPU
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-foreground">
              {liveSys?.cpuPercent ?? "--"}%
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">
              <TrendingUpIcon className="size-3" /> CPU
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.cpu} dataKey="cpu" color="hsl(var(--primary))" highColor="var(--primary)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-0 relative">
          <div className="text-muted-foreground">Processor utilization</div>
          {cpuTrend && (
            <span className={Number(cpuTrend) >= 0 ? "text-[var(--destructive)]" : "text-[var(--success)]"}>
              {Number(cpuTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(cpuTrend)).toFixed(1)}% vs 1h ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-card to-card/80 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 *:data-[slot=card]:bg-transparent *:data-[slot=card]:shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-success/5 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0 relative">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1 text-muted-foreground/80">
              <MemoryStickIcon className="size-3 text-[var(--success)]" /> Memory
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-foreground">
              {liveSys?.memoryUsedPercent ?? "--"}%
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline" className="bg-success/5 border-success/20 text-success">
              {liveSys ? formatBytes(liveSys.memoryAvailableBytes) : "--"} free
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.mem} dataKey="mem" color="hsl(var(--success))" highColor="var(--success)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-0 relative">
          <div className="text-muted-foreground">
            {liveSys ? `${formatBytes(liveSys.memoryTotalBytes)} total` : ""}
          </div>
          {memTrend && (
            <span className={Number(memTrend) >= 0 ? "text-[var(--destructive)]" : "text-[var(--success)]"}>
              {Number(memTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(memTrend)).toFixed(1)}% vs 1h ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-card to-card/80 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 *:data-[slot=card]:bg-transparent *:data-[slot=card]:shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-warning/5 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0 relative">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1 text-muted-foreground/80">
              <HardDriveIcon className="size-3 text-[var(--warning)]" /> Disk
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-foreground">
              {liveSys?.diskUsedPercent != null ? `${liveSys.diskUsedPercent}%` : "--"}
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline" className="bg-warning/5 border-warning/20 text-warning">
              {liveSys ? formatBytes(liveSys.diskFreeBytes) : "--"} free
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.disk} dataKey="disk" color="hsl(var(--warning))" highColor="var(--warning)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-0 relative">
          <div className="text-muted-foreground">
            {liveSys ? `${formatBytes(liveSys.diskTotalBytes)} total` : ""}
          </div>
          {diskTrend && (
            <span className={Number(diskTrend) >= 0 ? "text-[var(--destructive)]" : "text-[var(--success)]"}>
              {Number(diskTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(diskTrend)).toFixed(1)}% vs 1h
              ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card className="relative overflow-hidden border-border/40 bg-gradient-to-br from-card to-card/80 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 *:data-[slot=card]:bg-transparent *:data-[slot=card]:shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/20 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0 relative">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1 text-muted-foreground/80">
              <TimerIcon className="size-3 text-muted-foreground" /> System Load
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums text-foreground">
              {liveSys?.load1m != null ? liveSys.load1m.toFixed(1) : "--"}
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline" className="bg-muted/10 border-muted/20 text-muted-foreground">
              load average
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.load} dataKey="load" color="hsl(var(--muted-foreground))" highColor="var(--muted-foreground)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-0 relative">
          <div className="text-muted-foreground">System load (1m)</div>
          <span className="text-muted-foreground">
            1m {liveSys?.load1m?.toFixed(1) ?? "--"} / 5m {liveSys?.load5m?.toFixed(1) ?? "--"}{" "}
            / 15m {liveSys?.load15m?.toFixed(1) ?? "--"}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
