import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function MetricChartCard({
  title,
  description,
  children,
  className,
  action,
}: MetricChartCardProps) {
  return (
    <Card className={cn("overflow-hidden transition-all duration-200", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-display">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">{children}</CardContent>
    </Card>
  );
}