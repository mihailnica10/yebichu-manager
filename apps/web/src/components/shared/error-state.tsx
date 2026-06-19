import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <AlertCircleIcon className="size-8 text-destructive/60" />
      <p className="text-sm font-medium text-destructive">{title}</p>
      {message && <p className="text-sm text-muted-foreground max-w-sm">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCwIcon className="size-3 mr-1.5" />Retry
        </Button>
      )}
    </div>
  );
}
