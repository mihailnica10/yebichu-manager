import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "./sparkline";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  trend?: ReactNode;
  sparklineData?: number[];
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, sparklineData, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            {icon}{title}
          </span>
          {trend && <div className="text-xs">{trend}</div>}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {sparklineData && <Sparkline data={sparklineData} height={32} />}
      </CardContent>
    </Card>
  );
}
