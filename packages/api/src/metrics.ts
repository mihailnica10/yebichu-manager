import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getDb, lt, schema } from "@mt5/db";
import { fetchBridgeHealth } from "./bridge";
import { emitSocketEvent } from "./socket";

const COLLECTION_INTERVAL = 30_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL = 60 * 60 * 1000;

let started = false;
let collectInterval: ReturnType<typeof setInterval> | null = null;
let pruneInterval: ReturnType<typeof setInterval> | null = null;

function readProc(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function getCpuPercent(): number {
  const stat = readProc("/proc/stat");
  const line = stat.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return 0;
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3];
  const total = parts.reduce((a, b) => a + b, 0);
  return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

function getMemoryInfo() {
  const info = readProc("/proc/meminfo");
  const lines = Object.fromEntries(
    info
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [k, v] = l.split(":");
        return [k?.trim(), Number.parseInt(v?.trim()) || 0];
      }),
  );
  const totalBytes = lines.MemTotal * 1024;
  const availableBytes = lines.MemAvailable * 1024;
  return {
    totalBytes,
    availableBytes,
    usedPercent: totalBytes > 0 ? Math.round((1 - availableBytes / totalBytes) * 100) : 0,
  };
}

function getLoadAvg() {
  const load = readProc("/proc/loadavg");
  const parts = load.split(" ").slice(0, 3).map(Number);
  return { load1m: parts[0] || 0, load5m: parts[1] || 0, load15m: parts[2] || 0 };
}

function getDiskInfo() {
  try {
    const out = execSync("df -B1 /", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
    const lines = out.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    const totalBytes = Number.parseInt(parts[1], 10);
    const freeBytes = Number.parseInt(parts[3], 10);
    const usedPercent = totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 100) : 0;
    return { totalBytes, freeBytes, usedPercent };
  } catch {
    return null;
  }
}

function parseBytes(str: string): number {
  if (!str) return 0;
  const s = str.trim().toUpperCase();
  if (s.endsWith("KIB")) return Number.parseFloat(s) * 1024;
  if (s.endsWith("MIB")) return Number.parseFloat(s) * 1024 * 1024;
  if (s.endsWith("GIB")) return Number.parseFloat(s) * 1024 * 1024 * 1024;
  if (s.endsWith("KB")) return Number.parseFloat(s) * 1000;
  if (s.endsWith("MB")) return Number.parseFloat(s) * 1000 * 1000;
  if (s.endsWith("GB")) return Number.parseFloat(s) * 1000 * 1000 * 1000;
  if (s.endsWith("B")) return Number.parseFloat(s);
  return Number.parseFloat(s) || 0;
}

function parseNet(str: string): number {
  if (!str) return 0;
  const s = str.trim();
  if (s.endsWith("kB")) return Number.parseFloat(s) * 1000;
  if (s.endsWith("MB")) return Number.parseFloat(s) * 1000 * 1000;
  if (s.endsWith("GB")) return Number.parseFloat(s) * 1000 * 1000 * 1000;
  if (s.endsWith("B")) return Number.parseFloat(s);
  return Number.parseFloat(s) || 0;
}

function parseDockerStats(raw: any) {
  const memParts = (raw.MemUsage || "0B / 0B").split("/");
  return {
    cpuPercent: Number.parseFloat(String(raw.CPUPerc || "0").replace("%", "")) || 0,
    memoryUsageBytes: parseBytes(memParts[0] || "0B"),
    memoryLimitBytes: parseBytes(memParts[1] || "0B"),
    memoryPercent: Number.parseFloat(String(raw.MemPerc || "0").replace("%", "")) || 0,
    networkRxBytes: parseNet((raw.NetIO || "0B / 0B").split("/")[0]),
    networkTxBytes: parseNet((raw.NetIO || "0B / 0B").split("/")[1] || "0B"),
    blockReadBytes: parseNet((raw.BlockIO || "0B / 0B").split("/")[0]),
    blockWriteBytes: parseNet((raw.BlockIO || "0B / 0B").split("/")[1] || "0B"),
    pidsCurrent: Number.parseInt(raw.PIDs || "0", 10) || 0,
  };
}

async function collectSystemMetrics() {
  try {
    const mem = getMemoryInfo();
    const disk = getDiskInfo();
    const load = getLoadAvg();
    const cpuPercent = getCpuPercent();
    await getDb()
      .insert(schema.systemMetrics)
      .values({
        cpuPercent,
        memoryUsedPercent: mem.usedPercent,
        memoryTotalBytes: mem.totalBytes,
        memoryAvailableBytes: mem.availableBytes,
        diskUsedPercent: disk?.usedPercent ?? 0,
        diskTotalBytes: disk?.totalBytes ?? 0,
        diskFreeBytes: disk?.freeBytes ?? 0,
        load1m: load.load1m,
        load5m: load.load5m,
        load15m: load.load15m,
      })
      .run();
    emitSocketEvent("system:metrics", {
      cpuPercent,
      memoryUsedPercent: mem.usedPercent,
      memoryTotalBytes: mem.totalBytes,
      memoryAvailableBytes: mem.availableBytes,
      diskUsedPercent: disk?.usedPercent ?? 0,
      diskTotalBytes: disk?.totalBytes ?? 0,
      diskFreeBytes: disk?.freeBytes ?? 0,
      load1m: load.load1m,
      load5m: load.load5m,
      load15m: load.load15m,
      recordedAt: Date.now(),
    });
  } catch {}
}

async function collectInstanceMetrics() {
  try {
    const instances = await getDb().select().from(schema.instances).all();
    for (const inst of instances) {
      try {
        const out = execSync(
          `docker stats --no-stream --format '{{json .}}' ${inst.name} 2>/dev/null`,
          {
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
          },
        );
        if (!out.trim()) continue;
        const raw = JSON.parse(out.trim());
        const parsed = parseDockerStats(raw);
        await getDb()
          .insert(schema.instanceMetrics)
          .values({
            instanceName: inst.name,
            ...parsed,
          })
          .run();
        emitSocketEvent("instance:metrics", {
          name: inst.name,
          cpuPercent: parsed.cpuPercent,
          memoryPercent: parsed.memoryPercent,
          memoryUsageBytes: parsed.memoryUsageBytes,
          memoryLimitBytes: parsed.memoryLimitBytes,
          networkRxBytes: parsed.networkRxBytes,
          networkTxBytes: parsed.networkTxBytes,
          blockReadBytes: parsed.blockReadBytes,
          blockWriteBytes: parsed.blockWriteBytes,
          pidsCurrent: parsed.pidsCurrent,
          recordedAt: Date.now(),
        });
      } catch {}

      try {
        const health = await fetchBridgeHealth(inst.name);
        if (health) {
          emitSocketEvent("bridge:status", {
            name: inst.name,
            status: health.status,
            mt5: health.mt5,
            terminal: health.terminal,
            account: health.account,
          });
        }
      } catch {}
    }
  } catch {}
}

async function pruneOldData() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await getDb()
      .delete(schema.instanceMetrics)
      .where(lt(schema.instanceMetrics.recordedAt, cutoff))
      .run();
    await getDb()
      .delete(schema.systemMetrics)
      .where(lt(schema.systemMetrics.recordedAt, cutoff))
      .run();
  } catch {}
}

export function startMetricsCollection() {
  if (started) return;
  started = true;

  if (collectInterval) clearInterval(collectInterval);
  if (pruneInterval) clearInterval(pruneInterval);

  collectSystemMetrics();
  collectInstanceMetrics();

  collectInterval = setInterval(() => {
    collectSystemMetrics();
    collectInstanceMetrics();
  }, COLLECTION_INTERVAL);

  pruneInterval = setInterval(() => {
    pruneOldData();
  }, PRUNE_INTERVAL);
}
