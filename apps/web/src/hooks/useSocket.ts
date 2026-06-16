"use client";
import { useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";
import { api } from "@/lib/api";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3557";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });
  }
  return socket;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const s = getSocket();

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) {
      setIsConnected(true);
    }
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [s]);

  return { socket: s, isConnected };
}

export interface SystemMetrics {
  cpuPercent: number;
  memoryUsedPercent: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  diskUsedPercent: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
  load1m: number;
  load5m: number;
  load15m: number;
  recordedAt: number;
}

export function useSystemMetrics() {
  const { socket, isConnected } = useSocket();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    api.get<SystemMetrics[]>("/system/metrics").then((res) => {
      if (res.data.length > 0) {
        const latest = res.data[0];
        setMetrics({
          ...latest,
          recordedAt: typeof latest.recordedAt === 'string' ? new Date(latest.recordedAt).getTime() : latest.recordedAt,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    function handler(data: SystemMetrics) {
      setMetrics(data);
    }
    socket.on("system:metrics", handler);
    return () => {
      socket.off("system:metrics", handler);
    };
  }, [socket, isConnected]);

  return metrics;
}

export interface InstanceMetrics {
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pidsCurrent: number;
  recordedAt: number;
}

export function useInstanceMetrics(instanceName: string) {
  const { socket, isConnected } = useSocket();
  const [metrics, setMetrics] = useState<InstanceMetrics | null>(null);

  useEffect(() => {
    api.get<InstanceMetrics[]>(`/instances/${instanceName}/metrics`).then((res) => {
      if (res.data.length > 0) {
        setMetrics(res.data[0]);
      }
    }).catch(() => {});
  }, [instanceName]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: InstanceMetrics) => {
      if (data.name === instanceName) {
        setMetrics(data);
      }
    };
    socket.on("instance:metrics", handler);
    return () => {
      socket.off("instance:metrics", handler);
    };
  }, [socket, isConnected, instanceName]);

  return metrics;
}

export function useInstanceLogs(instanceName: string | null) {
  const { socket, isConnected } = useSocket();
  const [logs, setLogs] = useState<{ stream: string; text: string; time: number }[]>([]);
  const bufferRef = useRef<typeof logs>([]);

  useEffect(() => {
    if (!socket || !instanceName) return;
    if (!isConnected) return;

    function subscribe() {
      socket.emit("subscribe:logs", instanceName);
    }

    const handler = (data: { name: string; stream: string; text: string; time: number }) => {
      if (data.name === instanceName) {
        bufferRef.current = [...bufferRef.current.slice(-200), data];
        setLogs(bufferRef.current);
      }
    };

    subscribe();
    socket.on("instance:log", handler);
    socket.on("connect", subscribe);

    return () => {
      socket.off("instance:log", handler);
      socket.off("connect", subscribe);
      socket.emit("unsubscribe:logs", instanceName);
    };
  }, [socket, isConnected, instanceName]);

  return logs;
}

export function useAuditEntry() {
  const { socket, isConnected } = useSocket();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ entries: any[] }>("/audit-log?limit=50").then((res) => {
      setEntries(res.data.entries);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: any) => {
      setEntries((prev) => [data, ...prev].slice(0, 50));
    };
    socket.on("audit:entry", handler);
    return () => {
      socket.off("audit:entry", handler);
    };
  }, [socket, isConnected]);

  return entries;
}

export function useInstanceEvents(instanceName?: string) {
  const { socket, isConnected } = useSocket();
  const [lastEvent, setLastEvent] = useState<{
    name: string;
    status: string;
    containerRunning: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    function handler(data: { name: string; status: string; containerRunning: boolean }) {
      if (!instanceName || data.name === instanceName) {
        setLastEvent(data);
      }
    }
    socket.on("instance:event", handler);
    return () => {
      socket.off("instance:event", handler);
    };
  }, [socket, isConnected, instanceName]);

  return lastEvent;
}

export function useInstanceConfig() {
  const { socket, isConnected } = useSocket();
  const [event, setEvent] = useState<{ name: string; config: any } | null>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: { name: string; config: any }) => {
      setEvent(data);
    };
    socket.on("instance:config", handler);
    return () => {
      socket.off("instance:config", handler);
    };
  }, [socket, isConnected]);

  return event;
}

export function useProfileEvents() {
  const { socket, isConnected } = useSocket();
  const [event, setEvent] = useState<{ type: "created" | "updated" | "deleted"; data: any } | null>(
    null,
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    const onCreated = (data: any) => setEvent({ type: "created", data });
    const onUpdated = (data: any) => setEvent({ type: "updated", data });
    const onDeleted = (data: any) => setEvent({ type: "deleted", data });

    socket.on("profiles:created", onCreated);
    socket.on("profiles:updated", onUpdated);
    socket.on("profiles:deleted", onDeleted);

    return () => {
      socket.off("profiles:created", onCreated);
      socket.off("profiles:updated", onUpdated);
      socket.off("profiles:deleted", onDeleted);
    };
  }, [socket, isConnected]);

  return event;
}
