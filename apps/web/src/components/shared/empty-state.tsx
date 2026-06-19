import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "page" | "card";
}

export function EmptyState({ icon, title, description, action, size = "page" }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center text-muted-foreground",
      size === "page" ? "py-16 gap-4" : "py-8 gap-3"
    )}>
      {icon && <div className={cn(size === "page" ? "size-12" : "size-8", "opacity-40")}>{icon}</div>}
      <p className={cn("font-medium", size === "page" ? "text-lg" : "text-sm")}>{title}</p>
      {description && <p className="text-sm max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
