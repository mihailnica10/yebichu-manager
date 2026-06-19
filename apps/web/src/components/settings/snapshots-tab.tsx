"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSocket } from "@/hooks/useSocket";
import {
  CameraIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
  AlertCircleIcon,
  FileIcon,
  History,
  ClockIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  ServerIcon,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { formatSize, relativeTime } from "@/lib/format";

interface Snapshot {
  id: number;
  name: string;
  description?: string;
  setType: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotVersion {
  id: number;
  version: number;
  fileCount: number;
  totalSize: number;
  notes?: string;
  createdAt: string;
}

export function SnapshotsTab() {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const [operationState, setOperationState] = useState<{
    operation: string;
    status: string;
    stage: string;
    message: string;
    progress_pct: number;
  } | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saveStep, setSaveStep] = useState<"idle" | "creating" | "capturing">("idle");
  const [confirmAction, setConfirmAction] = useState<"load" | "deploy" | null>(null);

  const { data: mgmt } = useQuery({
    queryKey: ["instance", "mt5-mgmt"],
    queryFn: () => api.get("/instances/mt5-mgmt").then((r) => r.data),
    refetchInterval: (query: any) => {
      const data = query.state.data;
      if (data?.containerRunning && !data?.wsPort) return 3000;
      return 30000;
    },
  });

  const {
    data: snapshots,
    isLoading: snapshotsLoading,
    isError: snapshotsError,
    error: snapshotsErrorObj,
  } = useQuery({
    queryKey: ["config-sets"],
    queryFn: () => api.get("/config-sets").then((r) => r.data.configSets),
    refetchInterval: 10_000,
  });

  const { data: selectedSnapshot, isLoading: selectedLoading } = useQuery({
    queryKey: ["config-set", selectedId],
    queryFn: () =>
      selectedId ? api.get(`/config-sets/${selectedId}`).then((r) => r.data) : null,
    enabled: !!selectedId,
  });

  const { data: versions } = useQuery({
    queryKey: ["config-set-versions", selectedId],
    queryFn: () =>
      selectedId
        ? api.get(`/config-sets/${selectedId}/versions`).then((r) => r.data.versions)
        : [],
    enabled: !!selectedId,
  });

  const saveSnapshot = useMutation({
    mutationFn: async (name: string) => {
      setSaveStep("creating");
      const createRes = await api.post("/config-sets", { name, setType: "full" }, { timeout: 30000 });
      const setId = createRes.data.id;
      setSaveStep("capturing");
      const captureRes = await api.post(`/config-sets/${setId}/capture`, {}, { timeout: 120000 });
      return { setId, ...captureRes.data };
    },
    onMutate: () => ({ toastId: toast.loading("Saving snapshot...") }),
    onSuccess: (data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      setSnapshotName("");
      setSelectedId(data.setId);
      toast.success(`Saved snapshot v${data.version} (${data.fileCount} files)`, { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => {
      toast.error(err.message, { id: ctx?.toastId });
    },
    onSettled: () => setSaveStep("idle"),
  });

  const loadSnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/config-sets/${id}/load`, {}, { timeout: 120000 });
    },
    onMutate: () => ({ toastId: toast.loading("Loading snapshot...") }),
    onSuccess: (_data, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      toast.success("Snapshot loaded into management instance", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const deploySnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/config-sets/${id}/deploy`, {}, { timeout: 120000 });
    },
    onMutate: () => ({ toastId: toast.loading("Deploying snapshot...") }),
    onSuccess: (_data, _vars, ctx) => {
      toast.success("Deployed to all assigned instances", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/config-sets/${id}`);
    },
    onMutate: () => ({ toastId: toast.loading("Deleting snapshot...") }),
    onSuccess: (_data, id, ctx) => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      if (selectedId === id) setSelectedId(null);
      toast.success("Snapshot deleted", { id: ctx?.toastId });
    },
    onError: (err: Error, _vars, ctx) => toast.error(err.message, { id: ctx?.toastId }),
  });

  const handleSave = useCallback(() => {
    const name = snapshotName.trim() || `Snapshot ${new Date().toLocaleString()}`;
    saveSnapshot.mutate(name);
  }, [snapshotName, saveSnapshot]);

  const saveProgress = saveStep === "creating" ? 50 : saveStep === "capturing" ? 90 : 0;
  const saveLabel =
    saveStep === "creating" ? "Creating snapshot..." : saveStep === "capturing" ? "Capturing files..." : "";

  useEffect(() => {
    if (confirmAction) {
      const timer = setTimeout(() => setConfirmAction(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [confirmAction]);

  useEffect(() => {
    setConfirmAction(null);
  }, [selectedId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      setOperationState(data);
      if (data.status === "completed") {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["config-sets"] });
        }, 1000);
      }
      if (data.status === "error") {
        toast.error(data.message || "Operation failed");
      }
    };
    socket.on("snapshot:progress", handler);
    return () => { socket.off("snapshot:progress", handler); };
  }, [socket, qc]);

  useEffect(() => {
    if (operationState && (operationState.status === "completed" || operationState.status === "error")) {
      const timer = setTimeout(() => setOperationState(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [operationState]);

  return (
    <Card className="flex flex-col min-h-0" size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CameraIcon className="size-4" />
          Config Snapshots
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-3">
        {/* Save input */}
        <div className="flex gap-2 shrink-0">
          <Input
            placeholder="Snapshot name..."
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            className="h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            disabled={saveStep !== "idle"}
          />
          <Button
            onClick={handleSave}
            disabled={saveStep !== "idle" || !mgmt?.containerRunning}
            className="shrink-0"
          >
            {saveStep !== "idle" ? (
              <Spinner className="size-3.5 mr-1" />
            ) : (
              <UploadIcon className="size-3.5 mr-1" />
            )}
            {saveStep !== "idle" ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Save progress */}
        {saveStep !== "idle" && (
          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{saveLabel}</span>
              <span>{saveProgress}%</span>
            </div>
            <Progress value={saveProgress} />
          </div>
        )}

        {/* Save error */}
        {saveSnapshot.isError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive shrink-0">
            <AlertCircleIcon className="size-3" />
            <span>{saveSnapshot.error?.message || "Failed to save snapshot"}</span>
          </div>
        )}

        {/* Snapshot operation progress */}
        {operationState && (
          <div className={cn(
            "shrink-0 rounded-lg border p-3 space-y-2 transition-colors",
            operationState.status === "running" && "border-primary/20 bg-primary/[0.03]",
            operationState.status === "completed" && "border-green-500/20 bg-green-500/[0.03]",
            operationState.status === "error" && "border-destructive/20 bg-destructive/[0.03]",
          )}>
            <div className="flex items-center gap-2 text-xs">
              {operationState.status === "running" && <Spinner className="size-3 shrink-0" />}
              {operationState.status === "completed" && (
                <span className="size-3 shrink-0 rounded-full bg-green-500" />
              )}
              {operationState.status === "error" && (
                <AlertCircleIcon className="size-3 shrink-0 text-destructive" />
              )}
              <span className="font-medium">
                {operationState.operation.charAt(0).toUpperCase() + operationState.operation.slice(1)}
              </span>
              <span className="text-muted-foreground capitalize">
                {operationState.stage.replace(/_/g, " ")}
              </span>
              <span className="ml-auto text-xs font-mono text-muted-foreground">
                {operationState.progress_pct}%
              </span>
            </div>

            <Progress value={operationState.progress_pct} className="h-1.5" />

            <p className="text-xs text-muted-foreground">{operationState.message}</p>
          </div>
        )}

        <Separator className="shrink-0" />

        {/* Main content area */}
        <div className="flex-1 min-h-0">
          {snapshotsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[60px] w-full rounded-lg" />
              ))}
            </div>
          ) : snapshotsError ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <AlertCircleIcon className="size-8 mb-2 text-destructive/60" />
              <p className="text-sm font-medium">Failed to load snapshots</p>
              <p className="text-xs mt-1 text-center max-w-[20ch]">
                {(snapshotsErrorObj as Error)?.message || "Connection error"}
              </p>
              <Button
                variant="outline"
                size="xs"
                className="mt-3"
                onClick={() => qc.invalidateQueries({ queryKey: ["config-sets"] })}
              >
                <RefreshCwIcon className="size-3 mr-1" />
                Retry
              </Button>
            </div>
          ) : !snapshots || snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted mb-3">
                <CameraIcon className="size-4" />
              </div>
              <p className="text-sm font-medium">No snapshots yet</p>
              <p className="text-xs mt-1 text-center max-w-[24ch]">
                Configure MT5 in the VNC panel, then save a snapshot to capture its state.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-1.5 pr-3">
                {snapshots.map((s: Snapshot) => (
                  <SnapshotCard
                    key={s.id}
                    snapshot={s}
                    isSelected={selectedId === s.id}
                    onSelect={() => setSelectedId(selectedId === s.id ? null : s.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Selected snapshot details */}
        {selectedId && (
          <>
            {selectedLoading ? (
              <div className="space-y-2 shrink-0">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2 mt-3">
                  <Skeleton className="h-7 w-[72px] rounded-lg" />
                  <Skeleton className="h-7 w-[72px] rounded-lg" />
                  <Skeleton className="h-7 w-7 rounded-lg" />
                </div>
              </div>
            ) : selectedSnapshot ? (
              <>
                <Separator className="shrink-0" />

                <div className="shrink-0">
                  <h3 className="font-medium text-sm">{selectedSnapshot.name}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedSnapshot.setType}
                    </Badge>
                    <span className="font-mono">v{selectedSnapshot.currentVersion}</span>
                    <span>·</span>
                    <span>{new Date(selectedSnapshot.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => {
                        if (confirmAction === "load") {
                          loadSnapshot.mutate(selectedSnapshot.id);
                          setConfirmAction(null);
                        } else {
                          setConfirmAction("load");
                        }
                      }}
                      disabled={
                        loadSnapshot.isPending || selectedSnapshot.currentVersion === 0
                      }
                    >
                      {loadSnapshot.isPending ? (
                        <Spinner className="size-3 mr-1" />
                      ) : (
                        <DownloadIcon className="size-3 mr-1" />
                      )}
                      {loadSnapshot.isPending
                        ? "Loading..."
                        : confirmAction === "load"
                          ? "Confirm Load?"
                          : "Load"}
                    </Button>

                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        if (confirmAction === "deploy") {
                          deploySnapshot.mutate(selectedSnapshot.id);
                          setConfirmAction(null);
                        } else {
                          setConfirmAction("deploy");
                        }
                      }}
                      disabled={
                        deploySnapshot.isPending || selectedSnapshot.currentVersion === 0
                      }
                    >
                      {deploySnapshot.isPending ? (
                        <Spinner className="size-3 mr-1" />
                      ) : (
                        <ServerIcon className="size-3 mr-1" />
                      )}
                      {deploySnapshot.isPending
                        ? "Deploying..."
                        : confirmAction === "deploy"
                          ? "Confirm Deploy?"
                          : "Deploy"}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                        >
                          {deleteSnapshot.isPending ? (
                            <Spinner className="size-3" />
                          ) : (
                            <Trash2Icon className="size-3" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogMedia>
                            <AlertTriangleIcon className="size-6 text-destructive" />
                          </AlertDialogMedia>
                          <AlertDialogTitle>Delete snapshot?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete &ldquo;{selectedSnapshot.name}&rdquo;
                            and all its versions. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => deleteSnapshot.mutate(selectedSnapshot.id)}
                            disabled={deleteSnapshot.isPending}
                          >
                            {deleteSnapshot.isPending ? (
                              <>
                                <Spinner className="size-3 mr-1" />
                                Deleting...
                              </>
                            ) : (
                              "Delete"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {/* Inline mutation errors */}
                  {loadSnapshot.isError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                      <AlertCircleIcon className="size-3" />
                      {loadSnapshot.error?.message || "Load failed"}
                    </p>
                  )}
                  {deploySnapshot.isError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                      <AlertCircleIcon className="size-3" />
                      {deploySnapshot.error?.message || "Deploy failed"}
                    </p>
                  )}
                  {deleteSnapshot.isError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                      <AlertCircleIcon className="size-3" />
                      {deleteSnapshot.error?.message || "Delete failed"}
                    </p>
                  )}
                </div>

                {/* Versions */}
                {versions && versions.length > 0 && (
                  <div className="space-y-1.5 shrink-0">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1 pt-1">
                      <History className="size-3" />
                      Version History
                    </h4>
                    {[...versions]
                      .sort((a: SnapshotVersion, b: SnapshotVersion) => b.version - a.version)
                      .map((v: SnapshotVersion) => (
                        <div
                          key={v.id}
                          className={cn(
                            "flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors",
                            v.version === selectedSnapshot.currentVersion
                              ? "bg-primary/5 ring-1 ring-primary/20"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "font-mono font-medium shrink-0",
                                v.version === selectedSnapshot.currentVersion
                                  ? "text-primary"
                                  : "text-foreground"
                              )}
                            >
                              v{v.version}
                            </span>
                            {v.version === selectedSnapshot.currentVersion && (
                              <Badge variant="default" className="text-[9px] h-4 px-1 leading-none">
                                current
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground shrink-0 ml-2">
                            <span className="flex items-center gap-1">
                              <FileIcon className="size-3" />
                              {v.fileCount}
                            </span>
                            <span>{formatSize(v.totalSize)}</span>
                            <span className="flex items-center gap-1">
                              <ClockIcon className="size-3" />
                              {relativeTime(v.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotCard({
  snapshot,
  isSelected,
  onSelect,
}: {
  snapshot: Snapshot;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const timeAgo = useMemo(() => relativeTime(snapshot.updatedAt), [snapshot.updatedAt]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-2.5 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5 hover:bg-muted/30",
        isSelected
          ? "ring-2 ring-primary border-primary/30 bg-primary/[0.03]"
          : "hover:ring-1 hover:ring-foreground/10"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm block truncate">{snapshot.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px] h-4 font-mono">
              v{snapshot.currentVersion}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{timeAgo}</span>
          </div>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {snapshot.setType}
        </Badge>
      </div>
    </button>
  );
}
