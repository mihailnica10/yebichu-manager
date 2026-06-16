import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { desc, getDb, gte, schema, sql } from "@mt5/db";
import { getActorId } from "../audit";

const SystemResponse = z
  .object({
    host: z.object({
      hostname: z.string(),
      uptime: z.number(),
      load: z.array(z.number()),
    }),
    cpu: z.object({ cores: z.number(), usagePercent: z.number() }).optional(),
    memory: z
      .object({ totalBytes: z.number(), availableBytes: z.number(), usedPercent: z.number() })
      .optional(),
    disk: z
      .object({ totalBytes: z.number(), freeBytes: z.number(), usedPercent: z.number() })
      .optional(),
  })
  .openapi("SystemResponse");

const systemRoute = createRoute({
  method: "get",
  path: "/system",
  responses: {
    200: {
      content: { "application/json": { schema: SystemResponse } },
      description: "System info",
    },
    401: { description: "Unauthorized" },
  },
});

const systemMetricsHistoryRoute = createRoute({
  method: "get",
  path: "/system/metrics",
  request: {
    query: z.object({ range: z.string().optional() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(z.any()) } },
      description: "System metrics history",
    },
    401: { description: "Unauthorized" },
  },
});

function readProc(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function getCpuInfo() {
  const info = readProc("/proc/cpuinfo");
  const cores = info.split("\n").filter((l) => l.startsWith("processor")).length;
  const stat = readProc("/proc/stat");
  const line = stat.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return { cores, usagePercent: 0 };
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3];
  const total = parts.reduce((a, b) => a + b, 0);
  return { cores, usagePercent: total > 0 ? Math.round((1 - idle / total) * 100) : 0 };
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

function getUptime() {
  const up = readProc("/proc/uptime");
  return Number.parseFloat(up.split(" ")[0]) || 0;
}

function getLoadAvg() {
  const load = readProc("/proc/loadavg");
  return load.split(" ").slice(0, 3).map(Number);
}

function getDiskInfo() {
  try {
    const out = execSync("df -B1 /", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
    const lines = out.trim().split("\n");
    if (lines.length < 2) return undefined;
    const parts = lines[1].split(/\s+/);
    const totalBytes = Number.parseInt(parts[1], 10);
    const freeBytes = Number.parseInt(parts[3], 10);
    const usedPercent = totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 100) : 0;
    return { totalBytes, freeBytes, usedPercent };
  } catch {
    return undefined;
  }
}

export function systemRoutes(app: OpenAPIHono) {
  app.openapi(systemRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    return c.json({
      host: {
        hostname: process.env.HOST || "unknown",
        uptime: getUptime(),
        load: getLoadAvg(),
      },
      cpu: getCpuInfo(),
      memory: getMemoryInfo(),
      disk: getDiskInfo(),
    });
  });

  app.openapi(systemMetricsHistoryRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { range } = c.req.valid("query");

    let since: Date;
    let bucket: string | null = null;
    switch (range) {
      case "6h":
        since = new Date(Date.now() - 6 * 60 * 60 * 1000);
        bucket = null;
        break;
      case "24h":
        since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        bucket = "5m";
        break;
      case "7d":
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        bucket = "1h";
        break;
      case "30d":
        since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        bucket = "6h";
        break;
      default:
        since = new Date(Date.now() - 60 * 60 * 1000);
        bucket = null;
        break;
    }

    const db = getDb();

    if (bucket) {
      const bucketExpr =
        bucket === "5m"
          ? sql`strftime('%Y-%m-%dT%H:%M:00', ${schema.systemMetrics.recordedAt} / 1000, 'unixepoch')`
          : bucket === "1h"
            ? sql`strftime('%Y-%m-%dT%H:00:00', ${schema.systemMetrics.recordedAt} / 1000, 'unixepoch')`
            : sql`strftime('%Y-%m-%dT%H:00:00', (${schema.systemMetrics.recordedAt} / 1000 / 21600) * 21600, 'unixepoch')`;

      const metrics = await db
        .select({
          bucket: bucketExpr.as("bucket"),
          cpuPercent: sql<number>`avg(${schema.systemMetrics.cpuPercent})`.as("cpu_percent"),
          memoryUsedPercent: sql<number>`avg(${schema.systemMetrics.memoryUsedPercent})`.as(
            "memory_used_percent",
          ),
          memoryTotalBytes: sql<number>`avg(${schema.systemMetrics.memoryTotalBytes})`.as(
            "memory_total_bytes",
          ),
          memoryAvailableBytes: sql<number>`avg(${schema.systemMetrics.memoryAvailableBytes})`.as(
            "memory_available_bytes",
          ),
          diskUsedPercent: sql<number>`avg(${schema.systemMetrics.diskUsedPercent})`.as(
            "disk_used_percent",
          ),
          diskTotalBytes: sql<number>`avg(${schema.systemMetrics.diskTotalBytes})`.as(
            "disk_total_bytes",
          ),
          diskFreeBytes: sql<number>`avg(${schema.systemMetrics.diskFreeBytes})`.as(
            "disk_free_bytes",
          ),
          load1m: sql<number>`avg(${schema.systemMetrics.load1m})`.as("load_1m"),
          load5m: sql<number>`avg(${schema.systemMetrics.load5m})`.as("load_5m"),
          load15m: sql<number>`avg(${schema.systemMetrics.load15m})`.as("load_15m"),
        })
        .from(schema.systemMetrics)
        .where(gte(schema.systemMetrics.recordedAt, since))
        .groupBy(bucketExpr)
        .orderBy(bucketExpr)
        .all();

      return c.json(
        metrics.map((m) => ({ ...m, recordedAt: new Date(m.bucket as string).getTime() })),
      );
    }

    const metrics = await db
      .select()
      .from(schema.systemMetrics)
      .where(gte(schema.systemMetrics.recordedAt, since))
      .orderBy(desc(schema.systemMetrics.recordedAt))
      .all();

    return c.json(
      metrics.map((m) => ({
        ...m,
        recordedAt:
          m.recordedAt instanceof Date ? m.recordedAt.getTime() : m.recordedAt,
      })),
    );
  });
}
