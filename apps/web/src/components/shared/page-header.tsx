import type { ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  backUrl?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, backUrl, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {backUrl && (
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href={backUrl}><ArrowLeftIcon className="size-4" /></Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold font-display truncate">{title}</h1>
          {description && <p className="text-sm text-muted-foreground truncate">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
