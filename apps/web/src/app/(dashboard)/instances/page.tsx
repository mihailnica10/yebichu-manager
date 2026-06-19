"use client";
import { CreateInstanceDialog } from "@/components/create-instance-dialog";
import { InstanceActions } from "@/components/instance-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInstanceEvents, useSocketConnectionStatus } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRunningTime } from "@/lib/format";
import { ClipboardCopyIcon, ServerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Instance {
  name: string;
  status: string;
  containerRunning: boolean;
  vncPort?: number;
  wsPort?: number;
  bridgePort?: number;
  vncUrl?: string;
  wsUrl?: string;
  apiUrl?: string;
  vncPassword?: string;
  createdAt?: string;
  updatedAt?: string;
  configJson?: string;
}

export default function InstancesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const connected = useSocketConnectionStatus();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);

  const {
    data: instances,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["instances"],
    queryFn: async () => {
      const res = await api.get<{ instances: Instance[] }>("/instances");
      return res.data.instances;
    },
    refetchInterval: connected ? false : 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/instances/${name}`);
    },
    onMutate: () => ({ toastId: toast.loading("Deleting instance...") }),
    onSuccess: (_data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      setDeleteName(null);
      toast.success("Instance deleted", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message, { id: ctx?.toastId });
    },
  });

  const lastEvent = useInstanceEvents();
  const lastInvalidate = useRef(0);
  useEffect(() => {
    if (lastEvent) {
      const now = Date.now();
      if (now - lastInvalidate.current > 2000) {
        lastInvalidate.current = now;
        qc.invalidateQueries({ queryKey: ["instances"] });
      }
    }
  }, [lastEvent, qc]);

  if (error)
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load instances</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );

  if (isLoading)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-1">
            <div className="h-7 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Instances</h1>
            <p className="text-sm text-muted-foreground">Manage your trading instances</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <ServerIcon className="size-4 mr-2" />
            Create Instance
          </Button>
        </div>

        <CreateInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />

        {instances?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border rounded-xl bg-muted/20">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-5">
              <ServerIcon className="size-8 text-muted-foreground/60" />
            </div>
            <p className="text-lg font-medium text-foreground">No instances yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Create your first MT5 trading instance to get started
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instances?.map((inst) => (
              <Card
                key={inst.name}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-primary/20 group"
                onClick={() => router.push(`/instances/${inst.name}`)}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`size-2.5 rounded-full shrink-0 transition-colors ${
                          inst.containerRunning
                            ? "bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500/60%)]"
                            : "bg-zinc-400 dark:bg-zinc-600"
                        }`}
                      />
                      <CardTitle className="text-base font-display truncate group-hover:text-primary transition-colors">
                        {inst.name}
                      </CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {inst.containerRunning
                        ? `Up ${getRunningTime(inst.createdAt)}`
                        : inst.status === "error" ? "Error" : "Offline"}
                    </p>
                  </div>
                  <Badge
                    variant={inst.containerRunning ? "default" : "secondary"}
                    className={`shrink-0 whitespace-nowrap text-xs transition-colors ${
                      inst.containerRunning
                        ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-500/20"
                        : ""
                    }`}
                  >
                    {inst.status === "running" ? "Running" : inst.status === "stopped" ? "Stopped" : inst.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {inst.vncPort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap group/row">
                        <span className="font-medium w-12 shrink-0 text-foreground/60">VNC:</span>
                        <span className="tabular-nums">port {inst.vncPort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="opacity-0 group-hover/row:opacity-100 hover:text-primary transition-all ml-auto size-5 flex items-center justify-center rounded hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(
                                  `vnc://${window.location.hostname}:${inst.vncPort}`,
                                );
                              }}
                            >
                              <ClipboardCopyIcon className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">Copy VNC URL</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {inst.wsPort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap group/row">
                        <span className="font-medium w-12 shrink-0 text-foreground/60">WS:</span>
                        <span className="tabular-nums">port {inst.wsPort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="opacity-0 group-hover/row:opacity-100 hover:text-primary transition-all ml-auto size-5 flex items-center justify-center rounded hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(
                                  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${inst.wsPort}/websockify`,
                                );
                              }}
                            >
                              <ClipboardCopyIcon className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">Copy WebSocket URL</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {inst.bridgePort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap group/row">
                        <span className="font-medium w-12 shrink-0 text-foreground/60">Bridge:</span>
                        <span className="tabular-nums">port {inst.bridgePort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="opacity-0 group-hover/row:opacity-100 hover:text-primary transition-all ml-auto size-5 flex items-center justify-center rounded hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(
                                  `http://${window.location.hostname}:${inst.bridgePort}`,
                                );
                              }}
                            >
                              <ClipboardCopyIcon className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">Copy Bridge URL</TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                      <InstanceActions
                        name={inst.name}
                        containerRunning={inst.containerRunning}
                        variant="icon"
                        onDelete={() => setDeleteName(inst.name)}
                      />
                      {inst.createdAt && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(inst.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!deleteName} onOpenChange={(o) => !o && setDeleteName(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Instance</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {deleteName}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteName && deleteMutation.mutate(deleteName)}
                className="bg-destructive text-destructive-foreground"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
