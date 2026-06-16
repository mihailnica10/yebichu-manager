"use client";
import { VncViewer } from "@/components/vnc-viewer";
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
  MonitorIcon,
  ServerIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
  AlertCircleIcon,
  FileIcon,
  History,
  ClockIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  FolderIcon,
  FolderPlusIcon,
  ArrowUpIcon,
  TerminalIcon,
  CopyIcon,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

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

interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
  modifiedAt?: number;
}

interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  targetType: string;
  targetId: string;
  detailsJson: string | null;
  createdAt: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatLogAction(action: string): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  switch (action) {
    case "config_set_capture":
      return { label: "Capture", variant: "default" };
    case "config_set_deploy":
      return { label: "Deploy", variant: "secondary" };
    case "config_set_load":
      return { label: "Load", variant: "outline" };
    case "config_set_create":
      return { label: "Create", variant: "default" };
    case "config_set_delete":
      return { label: "Delete", variant: "destructive" };
    default:
      return { label: action.replace("config_set_", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), variant: "secondary" };
  }
}

function formatLogDetails(entry: AuditEntry): string {
  try {
    if (!entry.detailsJson) return "";
    const d = JSON.parse(entry.detailsJson);
    switch (entry.action) {
      case "config_set_capture":
        return `v${d.version} (${d.files} files)`;
      case "config_set_deploy":
        return `v${d.version} → ${Array.isArray(d.instances) ? d.instances.join(", ") : "unknown"}`;
      case "config_set_load":
        return `v${d.version}`;
      case "config_set_create":
        return d.name || "";
      default:
        return entry.detailsJson || "";
    }
  } catch {
    return "";
  }
}

export default function SettingsPage() {
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
  const [activeTab, setActiveTab] = useState<"vnc" | "files" | "logs">("vnc");
  const [currentPath, setCurrentPath] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: mgmt, isLoading: mgmtLoading } = useQuery({
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

  const { data: files, isLoading: filesLoading, isError: filesError, refetch: refetchFiles } = useQuery({
    queryKey: ["mgmt-files", currentPath],
    queryFn: () => api.get("/mgmt/files", { params: { path: currentPath } }).then((r) => r.data),
    enabled: activeTab === "files",
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get("/audit-log", { params: { limit: 50 } }).then((r) => r.data),
    refetchInterval: 10000,
    enabled: activeTab === "logs",
  });

  const { data: instanceLogs, refetch: refetchInstanceLogs } = useQuery({
    queryKey: ["instance-logs", "mt5-mgmt"],
    queryFn: () => api.get("/instances/mt5-mgmt/logs", { params: { tail: 100 } }).then((r) => r.data),
    refetchInterval: 15000,
    enabled: activeTab === "logs",
  });

  const startInstance = useMutation({
    mutationFn: () => api.post("/instances/mt5-mgmt/start"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instance", "mt5-mgmt"] });
      toast.success("Management instance starting...");
    },
    onError: (err: Error) => toast.error(err.message),
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
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      setSnapshotName("");
      setSelectedId(data.setId);
      toast.success(`Saved snapshot v${data.version} (${data.fileCount} files)`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSettled: () => setSaveStep("idle"),
  });

  const loadSnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/config-sets/${id}/load`, {}, { timeout: 120000 });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      toast.success("Snapshot loaded into management instance");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deploySnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/config-sets/${id}/deploy`, {}, { timeout: 120000 });
    },
    onSuccess: () => {
      toast.success("Deployed to all assigned instances");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/config-sets/${id}`);
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["config-sets"] });
      if (selectedId === id) setSelectedId(null);
      toast.success("Snapshot deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/mgmt/files/upload", {
        params: { path: currentPath },
        data: formData,
        headers: { "Content-Type": "multipart/form-data" },
      }),
    onSuccess: () => {
      refetchFiles();
      toast.success("Files uploaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (filePath: string) => api.delete("/mgmt/files", { params: { path: filePath } }),
    onSuccess: () => {
      refetchFiles();
      toast.success("File deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const mkdirMutation = useMutation({
    mutationFn: (dirPath: string) => api.post("/mgmt/files/mkdir", { params: { path: dirPath } }),
    onSuccess: () => {
      refetchFiles();
      toast.success("Directory created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const wsProto =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const vncWsUrl = mgmt?.wsPort
    ? `${wsProto}://${host}:${mgmt.wsPort}/websockify`
    : "";

  const handleSave = useCallback(() => {
    const name = snapshotName.trim() || `Snapshot ${new Date().toLocaleString()}`;
    saveSnapshot.mutate(name);
  }, [snapshotName, saveSnapshot]);

  const saveProgress = saveStep === "creating" ? 50 : saveStep === "capturing" ? 90 : 0;
  const saveLabel =
    saveStep === "creating" ? "Creating snapshot..." : saveStep === "capturing" ? "Capturing files..." : "";

  const goUp = useCallback(() => {
    setCurrentPath((prev) => {
      const parts = prev.split("/").filter(Boolean);
      parts.pop();
      return parts.join("/");
    });
  }, []);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files_list = e.target.files;
      if (!files_list || files_list.length === 0) return;
      const formData = new FormData();
      for (const file of Array.from(files_list)) {
        formData.append("files", file);
      }
      uploadMutation.mutate(formData);
      e.target.value = "";
    },
    [currentPath, uploadMutation],
  );

  const handleNewFolder = useCallback(() => {
    const name = window.prompt("Enter folder name:");
    if (!name || !name.trim()) return;
    const dirPath = currentPath ? `${currentPath}/${name.trim()}` : name.trim();
    mkdirMutation.mutate(dirPath);
  }, [currentPath, mkdirMutation]);

  const handleCopyLogs = useCallback(() => {
    if (typeof instanceLogs === "string") {
      navigator.clipboard.writeText(instanceLogs);
      toast.success("Logs copied to clipboard");
    }
  }, [instanceLogs]);

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

  const configSetLogs = useMemo(() => {
    if (!auditLogs?.entries) return [];
    return (auditLogs.entries as AuditEntry[]).filter(
      (e) =>
        e.action === "config_set_capture" ||
        e.action === "config_set_deploy" ||
        e.action === "config_set_load" ||
        e.action === "config_set_create" ||
        e.action === "config_set_delete",
    );
  }, [auditLogs]);

  const pathSegments = useMemo(() => {
    return currentPath.split("/").filter(Boolean);
  }, [currentPath]);

  const tabClass = (tab: "vnc" | "files" | "logs") =>
    cn(
      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
      activeTab === tab
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="px-4 lg:px-6 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage config snapshots via the management instance
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        <button className={tabClass("vnc")} onClick={() => setActiveTab("vnc")}>
          <MonitorIcon className="size-3.5 inline mr-1.5 -mt-0.5" />
          VNC &amp; Snapshots
        </button>
        <button className={tabClass("files")} onClick={() => setActiveTab("files")}>
          <FolderIcon className="size-3.5 inline mr-1.5 -mt-0.5" />
          File Explorer
        </button>
        <button className={tabClass("logs")} onClick={() => setActiveTab("logs")}>
          <TerminalIcon className="size-3.5 inline mr-1.5 -mt-0.5" />
          Logs
        </button>
      </div>

      {activeTab === "vnc" && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 h-[calc(100%-4.5rem)]">
          {/* VNC Panel */}
          <Card className="flex flex-col min-h-0" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorIcon className="size-4" />
                Management Instance
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col">
              {mgmtLoading ? (
                <Skeleton className="h-full rounded-lg" />
              ) : !mgmt?.containerRunning ? (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                  <MonitorIcon className="size-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium mb-1">Management Instance Not Running</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startInstance.mutate()}
                    disabled={startInstance.isPending}
                  >
                    {startInstance.isPending ? (
                      <Spinner className="size-3 mr-1" />
                    ) : null}
                    {startInstance.isPending ? "Starting..." : "Start Management Instance"}
                  </Button>
                  {startInstance.isError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-2">
                      <AlertCircleIcon className="size-3" />
                      {startInstance.error?.message || "Failed to start"}
                    </p>
                  )}
                </div>
              ) : !vncWsUrl ? (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground animate-pulse">
                  <MonitorIcon className="size-10 mb-3 opacity-50" />
                  <div className="flex items-center gap-2">
                    <Spinner className="size-4" />
                    <p className="text-sm font-medium">Detecting VNC port…</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <Badge variant="default" className="text-[10px] h-5 gap-1">
                      <span className="inline-block size-1.5 rounded-full bg-green-500" />
                      Connected
                    </Badge>
                    <span className="text-xs text-muted-foreground">mt5-mgmt</span>
                  </div>
                  <div className="flex-1 min-h-0 rounded-lg overflow-hidden ring-1 ring-foreground/5">
                    <VncViewer wsUrl={vncWsUrl} />
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground shrink-0">
                    <span>Click to interact · Scroll to zoom</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 underline hover:text-foreground transition-colors"
                      onClick={() => window.open(`/vnc/mt5-mgmt`, "_blank")}
                    >
                      Open in new tab
                    </button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Snapshots Panel */}
          <Card className="flex flex-col min-h-0" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CameraIcon className="size-4" />
                Config Snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
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
        </div>
      )}

      {activeTab === "files" && (
        <div className="flex flex-col h-[calc(100%-4.5rem)]">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleUpload}
            />
            <Button
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Spinner className="size-3 mr-1" />
              ) : (
                <UploadIcon className="size-3.5 mr-1" />
              )}
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={handleNewFolder}
              disabled={mkdirMutation.isPending}
            >
              {mkdirMutation.isPending ? (
                <Spinner className="size-3 mr-1" />
              ) : (
                <FolderPlusIcon className="size-3.5 mr-1" />
              )}
              New Folder
            </Button>
            {pathSegments.length > 0 && (
              <Button size="xs" variant="ghost" onClick={goUp}>
                <ArrowUpIcon className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm mb-3 shrink-0 text-muted-foreground">
            <button
              className="hover:text-foreground transition-colors font-medium"
              onClick={() => setCurrentPath("")}
            >
              MQL5
            </button>
            {pathSegments.map((segment, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-muted-foreground/40">/</span>
                <button
                  className="hover:text-foreground transition-colors"
                  onClick={() => setCurrentPath(pathSegments.slice(0, i + 1).join("/"))}
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>

          {/* File list */}
          <div className="flex-1 min-h-0">
            {filesLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : filesError ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircleIcon className="size-8 mb-2 text-destructive/60" />
                <p className="text-sm font-medium">Failed to load files</p>
                <Button
                  variant="outline"
                  size="xs"
                  className="mt-3"
                  onClick={() => refetchFiles()}
                >
                  <RefreshCwIcon className="size-3 mr-1" />
                  Retry
                </Button>
              </div>
            ) : !files?.entries || files.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FolderIcon className="size-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">This directory is empty</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-0.5 pr-3">
                  {/* Table header */}
                  <div className="flex items-center gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span className="w-[32px]" />
                    <span className="flex-1">Name</span>
                    <span className="w-[80px] text-right">Size</span>
                    <span className="w-[80px]">Type</span>
                    <span className="w-[100px]">Modified</span>
                    <span className="w-[40px]" />
                  </div>

                  {(files.entries as FileEntry[]).map((entry) => (
                    <div
                      key={entry.name}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                        entry.type === "dir"
                          ? "cursor-pointer hover:bg-muted/50"
                          : "hover:bg-muted/30",
                      )}
                      onClick={() => {
                        if (entry.type === "dir") {
                          const newPath = currentPath
                            ? `${currentPath}/${entry.name}`
                            : entry.name;
                          setCurrentPath(newPath);
                        }
                      }}
                    >
                      <span className="w-[32px] shrink-0 text-muted-foreground">
                        {entry.type === "dir" ? (
                          <FolderIcon className="size-4" />
                        ) : (
                          <FileIcon className="size-4" />
                        )}
                      </span>
                      <span className="flex-1 truncate font-medium">
                        {entry.name}
                      </span>
                      <span className="w-[80px] text-right text-xs text-muted-foreground shrink-0 font-mono">
                        {entry.type === "file" && entry.size != null
                          ? formatSize(entry.size)
                          : "-"}
                      </span>
                      <span className="w-[80px] text-xs text-muted-foreground shrink-0">
                        {entry.type === "dir" ? "folder" : "file"}
                      </span>
                      <span className="w-[100px] text-xs text-muted-foreground shrink-0">
                        {entry.type === "file" && entry.modifiedAt
                          ? new Date(entry.modifiedAt).toLocaleDateString()
                          : "-"}
                      </span>
                      <span className="w-[40px] shrink-0 flex justify-end">
                        {entry.type === "file" && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fullPath = currentPath
                                ? `${currentPath}/${entry.name}`
                                : entry.name;
                              deleteMutation.mutate(fullPath);
                            }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2Icon className="size-4" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[calc(100%-4.5rem)]">
          {/* Operation Logs */}
          <Card className="flex flex-col min-h-0" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                Operation Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col">
              <ScrollArea className="flex-1 min-h-0 pr-3">
                <div className="space-y-2">
                  {configSetLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <History className="size-8 mb-2 opacity-30" />
                      <p className="text-sm">No operation logs yet</p>
                    </div>
                  ) : (
                    configSetLogs.map((entry: AuditEntry) => {
                      const { label, variant } = formatLogAction(entry.action);
                      const details = formatLogDetails(entry);
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm"
                        >
                          <Badge variant={variant} className="text-[10px] shrink-0 mt-0.5">
                            {label}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            {details && (
                              <p className="font-medium truncate">{details}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Instance Logs */}
          <Card className="flex flex-col min-h-0" size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TerminalIcon className="size-4" />
                Instance Logs
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={handleCopyLogs}
                    disabled={typeof instanceLogs !== "string"}
                  >
                    <CopyIcon className="size-3 mr-1" />
                    Copy
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => refetchInstanceLogs()}
                  >
                    <RefreshCwIcon className="size-3" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {typeof instanceLogs === "string" ? (
                <ScrollArea className="h-full">
                  <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all bg-black/80 text-green-400/90 rounded-lg p-3 min-h-[200px]">
                    {instanceLogs || "No logs available"}
                  </pre>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Spinner className="size-6 mb-2" />
                  <p className="text-sm">Loading logs...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
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
        "w-full text-left rounded-lg border p-2.5 transition-all duration-150 hover:bg-muted/30",
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
