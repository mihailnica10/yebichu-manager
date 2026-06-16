"use client";
import { InstanceActions } from "@/components/instance-actions";
import { InstanceResources } from "@/components/instance-resources";
import { MarketPanel } from "@/components/market-panel";
import { RPAPanel } from "@/components/rpa-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { VncViewer } from "@/components/vnc-viewer";
import {
  useInstanceConfig,
  useInstanceEvents,
  useInstanceLogs,
  useSocket,
} from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  MonitorIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface InstanceDetail {
  name: string;
  status: string;
  containerRunning: boolean;
  containerId?: string;
  vncPort?: number;
  wsPort?: number;
  bridgePort?: number;
  vncUrl?: string;
  wsUrl?: string;
  apiUrl?: string;
  vncPassword?: string;
  configJson?: string;
  resourceLimitsJson?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function InstanceDetailPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const event = useInstanceEvents(name);
  const configEvent = useInstanceConfig();
  const { isConnected } = useSocket();
  const liveLogs = useInstanceLogs(name);
  const logLines = liveLogs.map((l) => l.text);
  const logsScrollRef = useRef<HTMLDivElement>(null);

  const scrollLogsToBottom = useCallback(() => {
    if (logsScrollRef.current) {
      const scrollArea = logsScrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollArea) {
        (scrollArea as HTMLElement).scrollTop = scrollArea.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    if (event) {
      qc.invalidateQueries({ queryKey: ["instance", name] });
    }
  }, [event, name, qc]);

  useEffect(() => {
    if (configEvent && configEvent.name === name) {
      qc.invalidateQueries({ queryKey: ["instance", name] });
    }
  }, [configEvent, name, qc]);

  const {
    data: instance,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["instance", name],
    queryFn: async () => {
      const res = await api.get<InstanceDetail>(`/instances/${name}`);
      return res.data;
    },
    enabled: !!name,
  });

  const { data: initialLogs } = useQuery({
    queryKey: ["logs", name],
    queryFn: async () => {
      const res = await api.get<{ logs: string }>(`/instances/${name}/logs?tail=100`);
      return res.data.logs;
    },
    refetchOnWindowFocus: false,
    enabled: !!name,
  });

  const allLogLines = [...(initialLogs?.split("\n").filter(Boolean) || []), ...logLines];

  if (error)
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load instance</p>
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
  if (!instance)
    return <div className="p-8 text-center text-muted-foreground">Instance not found</div>;

  const HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3 mb-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => router.push("/instances")}>
                <ArrowLeftIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to instances</TooltipContent>
          </Tooltip>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold font-display">{instance.name}</h1>
              <span
                className={`inline-block size-2.5 rounded-full ${instance.containerRunning ? "bg-green-500" : "bg-red-500"}`}
              />
              <Badge variant={instance.containerRunning ? "default" : "secondary"}>
                {instance.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Instance</p>
          </div>
          <div className="ms-auto">
            <InstanceActions
              name={instance.name}
              containerRunning={instance.containerRunning}
              variant="full"
              onDelete={() => router.push("/instances")}
            />
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="gap-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="webvnc">WebVNC</TabsTrigger>
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="trading">Trading</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab instance={instance} host={HOST} />
          </TabsContent>

          <TabsContent value="webvnc" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <WebVncTab instance={instance} host={HOST} />
              </div>
              <div className="xl:col-span-1">
                <RPAPanel name={instance.name} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="resources" className="mt-4">
            <InstanceResources name={instance.name} />
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display">Container Logs</CardTitle>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block size-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {isConnected ? "Live" : "Fallback"}
                    </span>
                    <Button variant="outline" size="sm" onClick={scrollLogsToBottom}>
                      <ChevronDownIcon className="size-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea
                  ref={logsScrollRef}
                  className="h-[500px] w-full rounded border-border bg-card/50 p-4"
                >
                  <pre className="text-foreground/80 font-mono text-xs whitespace-pre-wrap">
                    {allLogLines.length > 0 ? allLogLines.join("\n") : "No logs available"}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <ConfigEditor name={name} />
          </TabsContent>

          <TabsContent value="trading" className="mt-4">
            <MarketPanel name={name} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function OverviewTab({ instance, host }: { instance: InstanceDetail; host: string }) {
  const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="hover:ring-foreground/30 transition-colors">
        <CardHeader>
          <CardTitle className="text-base">Connection Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">VNC</span>
            <div className="flex items-center gap-2">
              <span className={`inline-block size-1.5 rounded-full ${instance.vncPort ? "bg-green-500" : "bg-red-500"}`} />
              <span className="font-mono text-xs">
                {instance.vncPort ? `vnc://${host}:${instance.vncPort}` : "Not available"}
              </span>
              {instance.vncPort && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(`vnc://${host}:${instance.vncPort}`)}
                    >
                      <ClipboardCopyIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy VNC URL</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">WebSocket</span>
            <div className="flex items-center gap-2">
              <span className={`inline-block size-1.5 rounded-full ${instance.wsPort ? "bg-green-500" : "bg-red-500"}`} />
              <span className="font-mono text-xs">
                {instance.wsPort
                  ? `${wsProto}://${host}:${instance.wsPort}/websockify`
                  : "Not available"}
              </span>
              {instance.wsPort && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="hover:text-foreground transition-colors"
                      onClick={() =>
                        copyToClipboard(`${wsProto}://${host}:${instance.wsPort}/websockify`)
                      }
                    >
                      <ClipboardCopyIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy WebSocket URL</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bridge API</span>
            <div className="flex items-center gap-2">
              <span className={`inline-block size-1.5 rounded-full ${instance.bridgePort ? "bg-green-500" : "bg-red-500"}`} />
              <span className="font-mono text-xs">
                {instance.bridgePort ? `http://${host}:${instance.bridgePort}` : "Not available"}
              </span>
              {instance.bridgePort && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="hover:text-foreground transition-colors"
                      onClick={() => copyToClipboard(`http://${host}:${instance.bridgePort}`)}
                    >
                      <ClipboardCopyIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy Bridge URL</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:ring-foreground/30 transition-colors">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {instance.wsPort && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/vnc/${instance.name}`} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-3" />
                Open VNC in Browser
              </a>
            </Button>
          )}
          {instance.bridgePort && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`http://${host}:${instance.bridgePort}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="size-3" />
                Open Bridge API
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" disabled>
            <RotateCcwIcon className="size-3" />
            Reset Container
          </Button>
        </CardContent>
      </Card>

      <Card className="hover:ring-foreground/30 transition-colors">
        <CardHeader>
          <CardTitle className="text-base">Instance Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-display font-medium">{instance.name}</span>
            <span className="text-muted-foreground">Status</span>
            <span>
              <Badge variant={instance.containerRunning ? "default" : "secondary"}>
                {instance.status}
              </Badge>
            </span>
            <span className="text-muted-foreground">Container</span>
            <span>{instance.containerRunning ? "Running" : "Stopped"}</span>
            {instance.containerId && (
              <>
                <span className="text-muted-foreground">Container ID</span>
                <span className="font-mono text-xs">{instance.containerId.slice(0, 12)}</span>
              </>
            )}
            {instance.vncPassword && (
              <>
                <span className="text-muted-foreground">VNC Password</span>
                <span className="font-mono text-xs">{instance.vncPassword}</span>
              </>
            )}
            {instance.createdAt && (
              <>
                <span className="text-muted-foreground">Created</span>
                <span className="tabular-nums">{new Date(instance.createdAt).toLocaleString()}</span>
              </>
            )}
            {instance.updatedAt && (
              <>
                <span className="text-muted-foreground">Updated</span>
                <span className="tabular-nums">{new Date(instance.updatedAt).toLocaleString()}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="hover:ring-foreground/30 transition-colors">
        <CardHeader>
          <CardTitle className="text-base">Resource Limits</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {instance.resourceLimitsJson ? (
            (() => {
              try {
                const lim = JSON.parse(instance.resourceLimitsJson);
                return (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPU Shares:</span>
                      <span className="font-mono">{lim.cpuShares ?? "Default (512)"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memory Limit:</span>
                      <span className="font-mono">{lim.memoryLimit || "Unlimited"}</span>
                    </div>
                  </>
                );
              } catch {
                return <p className="text-muted-foreground">Default</p>;
              }
            })()
          ) : (
            <p className="text-muted-foreground">Default (no limits set)</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WebVncTab({ instance, host }: { instance: InstanceDetail; host: string }) {
  const wsPort = instance.wsPort;
  const wsProto = window.location.protocol === "https:" ? "wss" : "ws";

  if (!wsPort) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <MonitorIcon className="size-12 mx-auto mb-4 opacity-50" />
          <p className="text-base font-medium mb-1">WebVNC Not Available</p>
          <p className="text-sm">The instance must be running with the VNC port exposed.</p>
          {instance.status !== "running" && (
            <p className="text-xs mt-2 text-warning">
              Start the instance to enable remote desktop access.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const wsUrl = `${wsProto}://${host}:${wsPort}/websockify`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Remote Desktop</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/vnc/${instance.name}`, "_blank")}
        >
          <ExternalLinkIcon className="size-3" />
          Open in New Tab
        </Button>
      </CardHeader>
      <CardContent>
        <VncViewer wsUrl={wsUrl} />
      </CardContent>
    </Card>
  );
}

function ConfigEditor({ name }: { name: string }) {
  const qc = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ["config", name],
    queryFn: async () => {
      const res = await api.get(`/instances/${name}/config`);
      return res.data;
    },
    enabled: !!name,
  });

  const updateMut = useMutation({
    mutationFn: async (body: any) => {
      await api.put(`/instances/${name}/config`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", name] });
      toast.success("Config saved");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const [serverIni, setServerIni] = useState("");
  const [commonJson, setCommonJson] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  useEffect(() => {
    if (config) {
      setServerIni(config.serverIni || "");
      const raw = config.commonJson;
      if (typeof raw === "string") {
        setCommonJson(raw);
      } else if (raw && typeof raw === "object") {
        setCommonJson(JSON.stringify(raw, null, 2));
      } else {
        setCommonJson("{}");
      }
    }
  }, [config]);

  function handleSave() {
    try {
      JSON.parse(commonJson);
    } catch {
      toast.error("Invalid JSON in common.json");
      return;
    }
    updateMut.mutate({
      serverIni,
      commonJson,
    });
    setShowRestartPrompt(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
              Advanced Configuration
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-2 border-l-2 border-muted">
                <div>
                  <label htmlFor="server-ini" className="text-sm font-medium mb-1 block">
                    server.ini
                  </label>
                  <Textarea
                    id="server-ini"
                    className="font-mono text-xs h-40"
                    value={serverIni}
                    onChange={(e) => setServerIni(e.target.value)}
                    placeholder="key=value"
                  />
                </div>
                <div>
                  <label htmlFor="common-json" className="text-sm font-medium mb-1 block">
                    common.json
                  </label>
                  <Textarea
                    id="common-json"
                    className="font-mono text-xs h-40"
                    value={commonJson}
                    onChange={(e) => setCommonJson(e.target.value)}
                    placeholder='{"key": "value"}'
                  />
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending ? "Saving..." : "Save"}
          </Button>

          {showRestartPrompt && (
            <div className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
              Some configuration changes may require a restart to take effect.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
