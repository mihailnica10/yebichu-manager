import { ClipboardCopyIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: "sm" | "xs";
}

export function CopyButton({ value, label = "Copy", size = "sm" }: CopyButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="hover:text-foreground transition-colors text-muted-foreground"
          onClick={(e) => { e.stopPropagation(); copyToClipboard(value); }}
        >
          <ClipboardCopyIcon className={size === "sm" ? "size-3.5" : "size-3"} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
