import { type Socket, io } from "socket.io-client";

let client: Socket | null = null;

const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:3557";

export function getSocketClient(): Socket {
  if (!client) {
    client = io(SOCKET_URL, {
      auth: { source: "api", secret: process.env.SOCKET_SECRET || "dev-secret" },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
    });
    client.on("connect", () => console.log("[socket] Connected to relay"));
    client.on("disconnect", () => console.log("[socket] Disconnected from relay"));
    client.on("connect_error", (err) => console.error("[socket] Connection error:", err.message));
  }
  return client;
}

export function emitSocketEvent(event: string, data: any) {
  try {
    const s = getSocketClient();
    s.emit(`api:${event}`, data);
  } catch {
    // Socket not connected — will be picked up on next poll
  }
}
