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
import { useInstanceEvents } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopyIcon, ServerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function getRunningTime(createdAt?: string): string {
  if (!createdAt) return "";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function InstancesPage() {
  const router = useRouter();
  const qc = useQueryClient();
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
    refetchInterval: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => {
      await api.delete(`/instances/${name}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances"] });
      setDeleteName(null);
      toast.success("Instance deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const lastEvent = useInstanceEvents();
  useEffect(() => {
    if (lastEvent) {
      qc.invalidateQueries({ queryKey: ["instances"] });
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
      <div className="flex justify-center p-8">
        <Spinner />
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
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ServerIcon className="size-12 mb-4 opacity-50" />
            <p className="text-lg">No instances yet</p>
            <p className="text-sm">Create your first instance to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {instances?.map((inst) => (
              <Card
                key={inst.name}
                className="cursor-pointer transition-colors hover:ring-foreground/30"
                onClick={() => router.push(`/instances/${inst.name}`)}
              >
                <CardHeader className="flex flex-row items-start justify-between pb-2 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full shrink-0 ${inst.containerRunning ? "bg-green-500" : "bg-gray-500"}`}
                      />
                      <CardTitle className="text-base font-display truncate">{inst.name}</CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inst.containerRunning
                        ? `Running ${getRunningTime(inst.createdAt)}`
                        : "Stopped"}
                    </p>
                  </div>
                  <Badge
                    variant={inst.containerRunning ? "default" : "secondary"}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {inst.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {inst.vncPort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="font-medium w-12 shrink-0">VNC:</span>
                        <span className="tabular-nums">port {inst.vncPort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="hover:text-foreground transition-colors ml-auto"
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
                          <TooltipContent>Copy VNC URL</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {inst.wsPort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="font-medium w-12 shrink-0">WS:</span>
                        <span className="tabular-nums">port {inst.wsPort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="hover:text-foreground transition-colors ml-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(
                                  `ws://${window.location.hostname}:${inst.wsPort}/websockify`,
                                );
                              }}
                            >
                              <ClipboardCopyIcon className="size-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copy WebSocket URL</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {inst.bridgePort && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                        <span className="font-medium w-12 shrink-0">Bridge:</span>
                        <span className="tabular-nums">port {inst.bridgePort}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="hover:text-foreground transition-colors ml-auto"
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
                          <TooltipContent>Copy Bridge URL</TooltipContent>
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
