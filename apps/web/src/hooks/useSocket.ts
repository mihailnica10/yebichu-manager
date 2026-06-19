"use client";
import { useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";
import { toast } from "sonner";
import { api } from "@/lib/api";

function getSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:3557`;
  }
  return "http://localhost:3557";
}
const SOCKET_URL = getSocketUrl();

let socket: Socket | null = null;
let lastErrorToast = 0;

function getSessionCookie(): string | undefined {
  if (typeof document === "undefined") return;
  const match = document.cookie.match(/(?:^|;\s*)mt5\.session=([^;]+)/);
  return match?.[1];
}

function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: { session: getSessionCookie() },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    socket.on("connect_error", (err) => {
      const now = Date.now();
      if (now - lastErrorToast > 10000) {
        lastErrorToast = now;
        const msg = err.message || "WebSocket connection failed";
        toast.error(`Connection lost: ${msg}`, {
          duration: 5000,
        });
      }
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function initSocket() {
  const s = getSocket();
  s.auth = { ...s.auth, session: getSessionCookie() };
  s.connect();
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

export function useSocketConnectionStatus() {
  const { isConnected } = useSocket();
  return isConnected;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get<SystemMetrics[]>("/system/metrics", { signal: ac.signal }).then((res) => {
      if (res.data.length > 0) {
        const latest = res.data[0];
        setMetrics({
          ...latest,
          recordedAt: typeof latest.recordedAt === 'string' ? new Date(latest.recordedAt).getTime() : latest.recordedAt,
        });
        setError(null);
      }
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
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

  return { metrics, error };
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get<InstanceMetrics[]>(`/instances/${instanceName}/metrics`, { signal: ac.signal }).then((res) => {
      if (res.data.length > 0) {
        setMetrics(res.data[0]);
        setError(null);
      }
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
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

  return { metrics, error };
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

interface AuditEntry {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  detailsJson: string;
  createdAt: number;
}

export function useAuditEntry() {
  const { socket, isConnected } = useSocket();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get<{ entries: AuditEntry[] }>("/audit-log?limit=50", { signal: ac.signal }).then((res) => {
      setEntries(res.data.entries);
      setError(null);
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: AuditEntry) => {
      setEntries((prev) => [data, ...prev].slice(0, 50));
    };
    socket.on("audit:entry", handler);
    return () => {
      socket.off("audit:entry", handler);
    };
  }, [socket, isConnected]);

  return { entries, error };
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

interface InstanceConfigEvent {
  name: string;
  config: Record<string, unknown>;
}

export function useInstanceConfig() {
  const { socket, isConnected } = useSocket();
  const [event, setEvent] = useState<InstanceConfigEvent | null>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: InstanceConfigEvent) => {
      setEvent(data);
    };
    socket.on("instance:config", handler);
    return () => {
      socket.off("instance:config", handler);
    };
  }, [socket, isConnected]);

  return event;
}

export function useBridgeStatus(name: string) {
  const { socket, isConnected } = useSocket();
  const [status, setStatus] = useState<{
    status: string;
    mt5: string;
    terminal: string;
    account: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
      api.get(`/bridge/${name}/health`, { signal: ac.signal })
      .then((r) => { setStatus(r.data); setError(null); })
      .catch((err) => {
        if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
      });
    return () => ac.abort();
  }, [name]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get(`/bridge/${name}/health`)
        .then((r) => setStatus(r.data))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, name]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: { name: string; status: string; mt5: string; terminal: string; account: Record<string, unknown> }) => {
      if (data.name === name) setStatus(data);
    };
    socket.on("bridge:status", handler);
    return () => { socket.off("bridge:status", handler); };
  }, [socket, isConnected, name]);

  return { status, error };
}

interface ProfileEvent {
  type: "created" | "updated" | "deleted";
  data: Record<string, unknown>;
}

export function useProfileEvents() {
  const { socket, isConnected } = useSocket();
  const [event, setEvent] = useState<ProfileEvent | null>(
    null,
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    const onCreated = (data: Record<string, unknown>) => setEvent({ type: "created", data });
    const onUpdated = (data: Record<string, unknown>) => setEvent({ type: "updated", data });
    const onDeleted = (data: Record<string, unknown>) => setEvent({ type: "deleted", data });

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

export function useMgmtStatus() {
  const { socket, isConnected } = useSocket();
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get("/instances/mt5-mgmt", { signal: ac.signal }).then(r => { setStatus(r.data); setError(null); }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get("/instances/mt5-mgmt")
        .then(r => setStatus(r.data))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: any) => setStatus(data);
    socket.on("mgmt:status", handler);
    return () => { socket.off("mgmt:status", handler); };
  }, [socket, isConnected]);

  return { status, error };
}

export function useConfigSetEvents() {
  const { socket, isConnected } = useSocket();
  const [event, setEvent] = useState<{ type: string; data: any } | null>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const created = (d: any) => setEvent({ type: "created", data: d });
    const updated = (d: any) => setEvent({ type: "updated", data: d });
    const deleted = (d: any) => setEvent({ type: "deleted", data: d });
    socket.on("config-set:created", created);
    socket.on("config-set:updated", updated);
    socket.on("config-set:deleted", deleted);
    return () => {
      socket.off("config-set:created", created);
      socket.off("config-set:updated", updated);
      socket.off("config-set:deleted", deleted);
    };
  }, [socket, isConnected]);

  return event;
}

// ---- Market data hooks ----

export function useMarketAccount(name: string) {
  const { socket, isConnected } = useSocket();
  const [account, setAccount] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get(`/instances/${name}/market/account`, { signal: ac.signal }).then((res) => {
      setAccount(res.data);
      setError(null);
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
  }, [name]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get(`/instances/${name}/market/account`)
        .then(res => setAccount(res.data))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, name]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: any) => {
      if (data.name === name) setAccount(data.data);
    };
    socket.on("market:account", handler);
    return () => { socket.off("market:account", handler); };
  }, [socket, isConnected, name]);

  return { account, error };
}

export function useMarketPositions(name: string) {
  const { socket, isConnected } = useSocket();
  const [positions, setPositions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get(`/instances/${name}/market/trades`, { signal: ac.signal }).then((res) => {
      setPositions(res.data.positions ?? []);
      setError(null);
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
  }, [name]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get(`/instances/${name}/market/trades`)
        .then(res => setPositions(res.data.positions ?? []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, name]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: any) => {
      if (data.name === name) setPositions(data.data);
    };
    socket.on("market:positions", handler);
    return () => { socket.off("market:positions", handler); };
  }, [socket, isConnected, name]);

  return { positions, error };
}

export function useMarketOrders(name: string) {
  const { socket, isConnected } = useSocket();
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get(`/instances/${name}/market/trades`, { signal: ac.signal }).then((res) => {
      setOrders(res.data.orders ?? []);
      setError(null);
    }).catch((err) => {
      if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
    });
    return () => ac.abort();
  }, [name]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get(`/instances/${name}/market/trades`)
        .then(res => setOrders(res.data.orders ?? []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, name]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data: any) => {
      if (data.name === name) setOrders(data.data);
    };
    socket.on("market:orders", handler);
    return () => { socket.off("market:orders", handler); };
  }, [socket, isConnected, name]);

  return { orders, error };
}

export function useMarketOHLC(name: string, symbol: string, timeframe: string) {
  const { socket, isConnected } = useSocket();
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.get(`/instances/${name}/market/ohlc?symbol=${symbol}&timeframe=${timeframe}&count=100`, { signal: ac.signal })
      .then((res) => {
        setData(res.data.candles ?? []);
        setError(null);
      }).catch((err) => {
        if (err.name !== "AbortError" && err.code !== "ERR_CANCELED") setError(err.message);
      });
    return () => ac.abort();
  }, [name, symbol, timeframe]);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      api.get(`/instances/${name}/market/ohlc?symbol=${symbol}&timeframe=${timeframe}&count=100`)
        .then(res => setData(res.data.candles ?? []))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected, name, symbol, timeframe]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (d: any) => {
      if (d.name === name && d.symbol === symbol && d.timeframe === timeframe) {
        setData((prev) => [...prev.slice(-500), ...d.data]);
      }
    };
    socket.on("market:ohlc", handler);
    return () => { socket.off("market:ohlc", handler); };
  }, [socket, isConnected, name, symbol, timeframe]);

  return { data, error };
}
