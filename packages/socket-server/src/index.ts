import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";

const PORT = Number.parseInt(process.env.SOCKET_PORT || "3557", 10);

const httpServer = createServer();
const io = new SocketServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.use((socket, next) => {
  const auth = socket.handshake.auth;
  if (auth?.source === "api") {
    const secret = process.env.SOCKET_SECRET || "dev-secret";
    if (auth.secret === secret) {
      socket.data.isApiClient = true;
      return next();
    }
    return next(new Error("Invalid API secret"));
  }
  next();
});

let clients = 0;
io.on("connection", (socket) => {
  clients++;
  console.log(`[socket] Client connected (${clients} total)`);

  socket.on("subscribe", (channel: string) => {
    socket.join(channel);
  });

  socket.on("unsubscribe", (channel: string) => {
    socket.leave(channel);
  });

  socket.on("subscribe:logs", (instanceName: string) => {
    const current = (socket.data.logCount as number) || 0;
    if (current >= 5) {
      socket.emit("error", { message: "Max log subscriptions (5) exceeded" });
      return;
    }

    const child = spawn("docker", ["logs", "--follow", `mt5-${instanceName}`]);
    socket.data.logCount = current + 1;

    child.stdout.on("data", (data: Buffer) => {
      socket.emit("instance:log", {
        name: instanceName,
        stream: "stdout",
        text: data.toString(),
        time: Date.now(),
      });
    });
    child.stderr.on("data", (data: Buffer) => {
      socket.emit("instance:log", {
        name: instanceName,
        stream: "stderr",
        text: data.toString(),
        time: Date.now(),
      });
    });

    child.on("exit", () => {
      socket.data.logCount = (socket.data.logCount as number) - 1;
    });

    socket.data.logProcesses = socket.data.logProcesses || {};
    socket.data.logProcesses[instanceName] = child;
  });

  socket.on("unsubscribe:logs", (instanceName: string) => {
    if (socket.data.logProcesses?.[instanceName]) {
      socket.data.logProcesses[instanceName].kill();
      delete socket.data.logProcesses[instanceName];
    }
  });

  socket.onAny((event, ...args) => {
    if (event.startsWith("api:")) {
      const relayEvent = event.slice(4);
      io.emit(relayEvent, ...args);
    }
  });

  socket.on("disconnect", () => {
    clients--;
    console.log(`[socket] Client disconnected (${clients} remaining)`);
    if (socket.data.logProcesses) {
      for (const child of Object.values(socket.data.logProcesses) as any[]) {
        child.kill();
      }
    }
  });
});

function spawnDockerEvents() {
  const child = spawn("docker", ["events", "--format", "{{json .}}"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (data: Buffer) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (["start", "stop", "die", "restart"].includes(event.status)) {
          const containerName = event.Actor?.Attributes?.name || event.Actor?.ID?.slice(0, 12);
          io.emit("instance:event", {
            name: containerName,
            status: event.status === "start" ? "running" : "stopped",
            containerRunning: event.status === "start",
          });
        }
      } catch {}
    }
  });
  child.on("exit", () => {
    console.log("[socket] Docker events stream exited, re-spawning in 1s...");
    setTimeout(spawnDockerEvents, 1000);
  });
}

spawnDockerEvents();

const HOST = process.env.SOCKET_HOST || "127.0.0.1";
httpServer.listen(PORT, HOST, () => {
  console.log(`[socket] Server running on ${HOST}:${PORT}`);
});
