"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  History,
  TerminalIcon,
  CopyIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { AnsiLogViewer } from "@/components/ansi-log-viewer";

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

export function LogsTab() {
  const logEndRef = useRef<HTMLDivElement>(null);

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get("/audit-log", { params: { limit: 50 } }).then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: instanceLogs, isLoading: instanceLogsLoading, refetch: refetchInstanceLogs } = useQuery({
    queryKey: ["instance-logs", "mt5-mgmt"],
    queryFn: () => api.get("/instances/mt5-mgmt/logs", { params: { tail: 100 } }).then((r) => r.data),
    refetchInterval: 15000,
  });

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [instanceLogs]);

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

  const logText = typeof instanceLogs === "string" ? instanceLogs : (instanceLogs?.logs ?? "");

  const handleCopyLogs = useCallback(() => {
    if (logText) {
      navigator.clipboard.writeText(logText);
      toast.success("Logs copied to clipboard");
    }
  }, [logText]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full">
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
                disabled={!logText}
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
          {instanceLogsLoading ? (
            <div className="h-full bg-muted/50 rounded-lg animate-pulse min-h-[200px]" />
          ) : (
            <ScrollArea className="h-full">
              {logText ? (
                <>
                  <AnsiLogViewer
                    text={logText}
                    className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all rounded-lg p-3 min-h-[200px] bg-black/80"
                  />
                  <div ref={logEndRef} />
                </>
              ) : (
                <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all bg-black/80 text-green-400/90 rounded-lg p-3 min-h-[200px]">
                  {"No logs available"}
                </pre>
              )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
