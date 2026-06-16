"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EyeIcon } from "lucide-react";

export function DetailsDialog({ detailsJson }: { detailsJson: string | null }) {
  if (!detailsJson || detailsJson === "null") {
    return <span className="text-muted-foreground">—</span>;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(detailsJson);
  } catch {
    return <span className="text-muted-foreground text-xs font-mono">{detailsJson}</span>;
  }
  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 gap-1 text-xs">
          <EyeIcon className="size-3" />
          {keys.length} field{keys.length > 1 ? "s" : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Details</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {keys.map((key) => (
            <div key={key} className="flex justify-between items-center border-b border-border/50 pb-2 last:border-0">
              <span className="text-muted-foreground font-medium">{key}</span>
              <span className="font-mono text-xs text-right max-w-56 truncate">
                {String(parsed[key])}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
