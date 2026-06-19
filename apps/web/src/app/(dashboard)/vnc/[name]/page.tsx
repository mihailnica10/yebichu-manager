"use client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { VncViewer } from "@/components/vnc-viewer";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, MonitorIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function VncPage() {
  const { name } = useParams<{ name: string }>();
  const router = useRouter();
  const vncHost = process.env.NEXT_PUBLIC_VNC_HOST || (typeof window !== "undefined" ? window.location.hostname : "localhost");

  const {
    data: instance,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["instance", name],
    queryFn: async () => {
      const res = await api.get<{ wsPort?: number }>(`/instances/${name}`);
      return res.data;
    },
    enabled: !!name,
  });

  if (error)
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">Failed to load instance</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    );

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-[50vh] md:h-[70vh] bg-muted rounded-xl animate-pulse" />
      </div>
    );

  if (!instance?.wsPort)
    return (
      <div className="flex justify-center p-8">
        <div className="text-center text-muted-foreground">
          <MonitorIcon className="size-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">VNC Not Available</p>
          <p className="text-sm">This instance does not have a VNC port exposed.</p>
        </div>
      </div>
    );

  const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${wsProto}://${vncHost}:${instance.wsPort}/websockify`;

  return (
    <div className="flex flex-col h-svh">
      <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/instances/${name}`)}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="font-display text-lg font-semibold">{name}</h1>
          <p className="text-xs text-muted-foreground">Remote Desktop</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">VNC Ready</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <VncViewer wsUrl={wsUrl} vncPassword={instance.vncPassword} />
      </div>
    </div>
  );
}
