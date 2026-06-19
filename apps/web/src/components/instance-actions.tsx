"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActionGroup, ActionItem } from "@/components/actions-dialog";
import { ActionsDialog } from "@/components/actions-dialog";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  HammerIcon,
  PlayIcon,
  RotateCcwIcon,
  Settings2Icon,
  SquareIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

interface InstanceActionsProps {
  name: string;
  containerRunning: boolean;
  variant?: "full" | "icon";
  onDelete?: () => void;
}

function useInstanceAction(name: string, action: string, successMsg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post(`/instances/${name}/${action}`);
    },
    onMutate: () => {
      return { toastId: toast.loading(`${action}...`) };
    },
    onSuccess: (_data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["instance", name] });
      qc.invalidateQueries({ queryKey: ["instances"] });
      toast.success(successMsg, { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message, { id: ctx?.toastId });
    },
  });
}

export function InstanceActions({
  name,
  containerRunning,
  variant = "icon",
  onDelete,
}: InstanceActionsProps) {
  const startMut = useInstanceAction(name, "start", "Instance started");
  const stopMut = useInstanceAction(name, "stop", "Instance stopped");
  const restartMut = useInstanceAction(name, "restart", "Instance restarted");
  const rebuildMut = useInstanceAction(name, "rebuild", "Instance rebuilt");
  const termRestartMut = useInstanceAction(name, "terminal-restart", "Terminal restarted");

  if (variant === "full") {
    return (
      <div className="flex gap-2 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                onClick={() => startMut.mutate()}
                disabled={containerRunning || startMut.isPending}
              >
                <PlayIcon /> Start
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Start container</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => stopMut.mutate()}
                disabled={!containerRunning || stopMut.isPending}
              >
                <SquareIcon /> Stop
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Stop container</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => restartMut.mutate()}
                disabled={restartMut.isPending || !containerRunning}
              >
                <RotateCcwIcon /> Restart
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Restart container</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="px-1">
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>More Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => rebuildMut.mutate()} disabled={rebuildMut.isPending}>
                <HammerIcon className="size-4" />
                Rebuild Image
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => termRestartMut.mutate()}
                disabled={termRestartMut.isPending}
              >
                <TerminalIcon className="size-4" />
                Restart Terminal
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete?.()}>
              <Trash2Icon className="size-4" />
              Delete Instance
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const actions: ActionGroup[] = [
    {
      items: [
        { icon: <PlayIcon />, label: "Start", onClick: () => startMut.mutate(), disabled: containerRunning || startMut.isPending },
        { icon: <SquareIcon />, label: "Stop", onClick: () => stopMut.mutate(), disabled: !containerRunning || stopMut.isPending },
        { icon: <RotateCcwIcon />, label: "Restart", onClick: () => restartMut.mutate(), disabled: restartMut.isPending },
      ],
    },
    {
      items: [
        { icon: <HammerIcon />, label: "Rebuild Image", onClick: () => rebuildMut.mutate(), disabled: rebuildMut.isPending },
        { icon: <TerminalIcon />, label: "Restart Terminal", onClick: () => termRestartMut.mutate(), disabled: termRestartMut.isPending },
      ],
    },
    {
      items: [
        { icon: <Trash2Icon />, label: "Delete", onClick: () => onDelete?.(), destructive: true },
      ],
    },
  ];

  return (
    <ActionsDialog
      title={name}
      trigger={
        <Button variant="outline" size="sm" className="h-7 w-7 p-0 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all">
          <Settings2Icon className="size-3" />
        </Button>
      }
      groups={actions}
    />
  );
}
