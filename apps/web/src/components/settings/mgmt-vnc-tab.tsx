"use client";
import { VncViewer } from "@/components/vnc-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MonitorIcon, AlertCircleIcon } from "lucide-react";

export function MgmtVncTab() {
  const { data: mgmt, isLoading: mgmtLoading } = useQuery({
    queryKey: ["instance", "mt5-mgmt"],
    queryFn: () => api.get("/instances/mt5-mgmt").then((r) => r.data),
    refetchInterval: (query: any) => {
      const data = query.state.data;
      if (data?.containerRunning && !data?.wsPort) return 3000;
      return 30000;
    },
  });

  const startInstance = useMutation({
    mutationFn: () => api.post("/instances/mt5-mgmt/start"),
    onError: (err: Error) => {},
  });

  const wsProto =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const vncWsUrl = mgmt?.wsPort
    ? `${wsProto}://${host}:${mgmt.wsPort}/websockify`
    : "";

  return (
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
  );
}
