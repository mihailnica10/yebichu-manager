"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { XIcon } from "lucide-react";

export interface ActionItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface ActionGroup {
  items: ActionItem[];
}

export function ActionsDialog({
  title,
  trigger,
  groups,
}: {
  title: string;
  trigger: React.ReactNode;
  groups: ActionGroup[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xs" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{title}</span>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1">
                <XIcon />
              </Button>
            </DialogClose>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <hr className="my-1 border-border/50" />}
              <div className="flex flex-col gap-1">
                {group.items.map((item, ii) => (
                  <DialogClose key={ii} asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "justify-start gap-3 h-10",
                        item.destructive && "text-destructive hover:text-destructive",
                      )}
                      onClick={item.onClick}
                      disabled={item.disabled}
                    >
                      <span className="size-4 shrink-0">{item.icon}</span>
                      {item.label}
                    </Button>
                  </DialogClose>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
