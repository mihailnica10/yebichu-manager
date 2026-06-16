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
}: { data: { v: number }[]; dataKey: string; color: string }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          dataKey="v"
          type="natural"
          fill={`url(#spark-${dataKey})`}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SectionCards({ range: rangeProp = "1h" }: { range?: string }) {
  const liveSys = useSystemMetrics();

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
    <div className="grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs *:data-[slot=card]:transition-colors *:data-[slot=card]:hover:ring-foreground/30 lg:px-6 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1">
              <CpuIcon className="size-3" /> CPU
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {liveSys?.cpuPercent ?? "--"}%
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline">
              <TrendingUpIcon /> CPU
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.cpu} dataKey="cpu" color="var(--color-foreground)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-1">
          <div className="text-muted-foreground">Processor utilization</div>
          {cpuTrend && (
            <span className={Number(cpuTrend) >= 0 ? "text-destructive" : "text-green-500"}>
              {Number(cpuTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(cpuTrend)).toFixed(1)}% vs 1h ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1">
              <MemoryStickIcon className="size-3" /> Memory
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {liveSys?.memoryUsedPercent ?? "--"}%
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline">
              {liveSys ? formatBytes(liveSys.memoryAvailableBytes) : "--"} free
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.mem} dataKey="mem" color="var(--color-foreground)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-1">
          <div className="text-muted-foreground">
            {liveSys ? `${formatBytes(liveSys.memoryTotalBytes)} total` : ""}
          </div>
          {memTrend && (
            <span className={Number(memTrend) >= 0 ? "text-destructive" : "text-green-500"}>
              {Number(memTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(memTrend)).toFixed(1)}% vs 1h ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1">
              <HardDriveIcon className="size-3" /> Disk
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {liveSys?.diskUsedPercent != null ? `${liveSys.diskUsedPercent}%` : "--"}
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline">
              {liveSys ? formatBytes(liveSys.diskFreeBytes) : "--"} free
            </Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.disk} dataKey="disk" color="var(--color-foreground)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-1">
          <div className="text-muted-foreground">
            {liveSys ? `${formatBytes(liveSys.diskTotalBytes)} total` : ""}
          </div>
          {diskTrend && (
            <span className={Number(diskTrend) >= 0 ? "text-destructive" : "text-green-500"}>
              {Number(diskTrend) >= 0 ? "↑" : "↓"} {Math.abs(Number(diskTrend)).toFixed(1)}% vs 1h
              ago
            </span>
          )}
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="pb-2 grid grid-cols-2 items-start gap-0">
          <div className="flex flex-col gap-1">
            <CardDescription className="flex items-center gap-1">
              <TimerIcon className="size-3" /> System Load
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {liveSys?.load1m != null ? liveSys.load1m.toFixed(1) : "--"}
            </CardTitle>
          </div>
          <CardAction className="justify-self-end">
            <Badge variant="outline">load average</Badge>
          </CardAction>
        </CardHeader>
        <Sparkline data={sparkData.load} dataKey="load" color="var(--color-foreground)" />
        <CardFooter className="flex-col items-start gap-1.5 text-xs pt-1">
          <div className="text-muted-foreground">System load (1m)</div>
          <span className="text-muted-foreground">
            Load: 1m {liveSys?.load1m?.toFixed(1) ?? "--"} / 5m {liveSys?.load5m?.toFixed(1) ?? "--"}{" "}
            / 15m {liveSys?.load15m?.toFixed(1) ?? "--"}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
