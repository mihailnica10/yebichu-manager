import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, getDb, gte, schema, sql } from "@mt5/db";
import { getActorId, logAudit } from "../audit";
import { checkImageExists } from "../docker";
import { emitSocketEvent } from "../socket";

const InstanceSchema = z
  .object({
    name: z.string().openapi({ example: "mt5-prod-1" }),
    status: z.string().openapi({ example: "running" }),
    containerRunning: z.boolean(),
    containerId: z.string().nullable().optional(),
    vncPort: z.number().optional(),
    wsPort: z.number().optional(),
    bridgePort: z.number().optional(),
    vncUrl: z.string().optional(),
    wsUrl: z.string().optional(),
    apiUrl: z.string().optional(),
    vncPassword: z.string().optional(),
    configJson: z.string().nullable().optional(),
    resourceLimitsJson: z.string().nullable().optional(),
    isManagement: z.boolean().optional(),
    createdAt: z.number().nullable().optional(),
    updatedAt: z.number().nullable().optional(),
  })
  .openapi("Instance");

const CreateInstanceBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .openapi({ example: "mt5-prod-1" }),
  password: z.string().optional(),
  isManagement: z.boolean().optional(),
});

const INSTANCES_DIR = process.env.INSTANCES_DIR || "/root/mt5/instances";
const SHARED_DIR = process.env.SHARED_DIR || "/root/mt5/shared";
const MAX_INSTANCES = Number.parseInt(process.env.MAX_INSTANCES || "10");
const PROFILES_CHARTS_DIR = process.env.PROFILES_CHARTS_DIR || "/home/misu/bank/Profiles/Charts";
const PROFILES_TEMPLATES_DIR =
  process.env.PROFILES_TEMPLATES_DIR || "/home/misu/bank/Profiles/Templates";
const PROFILES_SYMBOLSETS_DIR =
  process.env.PROFILES_SYMBOLSETS_DIR || "/home/misu/bank/Profiles/SymbolSets";
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "minio:9000";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "mt5-configs";

const listRoute = createRoute({
  method: "get",
  path: "/instances",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ instances: z.array(InstanceSchema) }) } },
      description: "List instances",
    },
    401: { description: "Unauthorized" },
  },
});

const createInstanceRoute = createRoute({
  method: "post",
  path: "/instances",
  request: { body: { content: { "application/json": { schema: CreateInstanceBody } } } },
  responses: {
    201: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Instance created",
    },
    400: { description: "Error" },
    401: { description: "Unauthorized" },
    409: { description: "Duplicate" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/instances/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: InstanceSchema } },
      description: "Instance details",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/instances/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.any() } }, description: "Delete result" },
    401: { description: "Unauthorized" },
  },
});

const startRoute = createRoute({
  method: "post",
  path: "/instances/{name}/start",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Instance started",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const stopRoute = createRoute({
  method: "post",
  path: "/instances/{name}/stop",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Instance stopped",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const restartRoute = createRoute({
  method: "post",
  path: "/instances/{name}/restart",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Instance restarted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const logsRoute = createRoute({
  method: "get",
  path: "/instances/{name}/logs",
  request: {
    params: z.object({ name: z.string() }),
    query: z.object({ tail: z.coerce.number().optional() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ logs: z.string() }) } },
      description: "Instance logs",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const configGetRoute = createRoute({
  method: "get",
  path: "/instances/{name}/config",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.any() } }, description: "Instance config" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const configPutRoute = createRoute({
  method: "put",
  path: "/instances/{name}/config",
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            serverIni: z.string().optional(),
            commonJson: z.any().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Config updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const applyProfilesRoute = createRoute({
  method: "post",
  path: "/instances/{name}/profiles/apply",
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            chartSet: z.string().optional(),
            template: z.string().optional(),
            symbolSet: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), details: z.any() }) },
      },
      description: "Profiles applied to instance",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const limitsGetRoute = createRoute({
  method: "get",
  path: "/instances/{name}/limits",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cpuShares: z.number().optional(),
            memoryLimit: z.string().optional(),
          }),
        },
      },
      description: "Instance resource limits",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const limitsPutRoute = createRoute({
  method: "put",
  path: "/instances/{name}/limits",
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            cpuShares: z.number().min(0).max(1024).optional(),
            memoryLimit: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Limits updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const rebuildRoute = createRoute({
  method: "post",
  path: "/instances/{name}/rebuild",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Instance rebuilt",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const terminalRestartRoute = createRoute({
  method: "post",
  path: "/instances/{name}/terminal-restart",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "MT5 terminal restarted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const execRoute = createRoute({
  method: "post",
  path: "/instances/{name}/exec",
  request: {
    params: z.object({ name: z.string() }),
    body: { content: { "application/json": { schema: z.object({ command: z.string() }) } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ output: z.string() }) } },
      description: "Command executed",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const instanceMetricsRoute = createRoute({
  method: "get",
  path: "/instances/{name}/metrics",
  request: {
    params: z.object({ name: z.string() }),
    query: z.object({ range: z.string().optional() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(z.any()) } },
      description: "Instance metrics history",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

function generateComposeContent(
  name: string,
  password: string,
  limits?: { cpuShares?: number; memoryLimit?: string },
  managementMode?: boolean,
): string {
  const instDir = `${INSTANCES_DIR}/${name}`;
  const BRIDGE_SRC = process.env.BRIDGE_SRC || "/home/misu/mt5-manager/scripts/mt5-bridge";
  const RUNTIME_DIR = process.env.RUNTIME_DIR || "/home/misu/mt5-manager/runtime";
  const lines: string[] = [];
  lines.push(`services:
  ${name}:
    image: mt5-tigervnc:latest
    container_name: ${name}
    restart: unless-stopped
    networks:
      - mt5-net
    ports:
      - 5901
      - 6080
      - 8090
    volumes:
      - ${SHARED_DIR}:/mt5-shared
      - ${instDir}/data:/mt5-instance
      - ${instDir}/wine:/config/.wine
      - ${BRIDGE_SRC}:/mt5-bridge
      - ${RUNTIME_DIR}/entrypoint.sh:/entrypoint.sh
    environment:
      - PASSWORD=${password}
      - INSTANCE_NAME=${name}
      - DISPLAY=:1
      - ENABLE_FILEBROWSER=false
      - ENABLE_API=true
      - BRIDGE_PORT=8090
      - MINIO_ENDPOINT=${MINIO_ENDPOINT}
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - MINIO_BUCKET=${MINIO_BUCKET}
      - CONFIG_SET_IDS=
      - API_URL=http://host.docker.internal:3001`);
  if (managementMode) {
    lines.push(`      - MANAGEMENT_MODE=true`);
  }
  if (limits?.cpuShares) {
    lines.push(`    cpu_shares: ${limits.cpuShares}`);
  }
  if (limits?.memoryLimit) {
    lines.push(`    mem_limit: ${limits.memoryLimit}`);
  }
  lines.push(`    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp=unconfined
    stdin_open: true
    tty: true
`);
  return lines.join("\n");
}

function getContainerId(name: string): string {
  try {
    return execSync(`docker inspect --format '{{.Id}}' ${name}`, { encoding: "utf-8" }).trim();
  } catch {
    return name;
  }
}

async function detectPorts(name: string) {
  try {
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return;

    let config: Record<string, any> = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}

    try {
      const vncPortInfo = execSync(`docker port ${name} 5901/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const vncPort = Number.parseInt(vncPortInfo.trim());
      if (!Number.isNaN(vncPort)) config.vncPort = vncPort;
    } catch {}

    try {
      const wsPortInfo = execSync(`docker port ${name} 6080/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const wsPort = Number.parseInt(wsPortInfo.trim());
      if (!Number.isNaN(wsPort)) config.wsPort = wsPort;
    } catch {}

    try {
      const bridgePortInfo = execSync(`docker port ${name} 8090/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const bridgePort = Number.parseInt(bridgePortInfo.trim());
      if (!Number.isNaN(bridgePort)) config.bridgePort = bridgePort;
    } catch {}

    await db
      .update(schema.instances)
      .set({ configJson: JSON.stringify(config), updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();
  } catch {}
}

function ensureSharedDir() {
  if (!existsSync(SHARED_DIR)) {
    mkdirSync(SHARED_DIR, { recursive: true });
  }
}

function listRunningContainers() {
  try {
    const out = execSync("docker ps -a --format '{{.Names}}\t{{.Status}}'", {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [name, status] = l.split("\t");
        return {
          name,
          status: status?.startsWith("Up") ? "running" : "stopped",
          containerRunning: status?.startsWith("Up") ?? false,
        };
      });
  } catch {
    return [];
  }
}

export function instanceRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const all = await getDb().select().from(schema.instances).all();
    const running = listRunningContainers();
    const runningMap = Object.fromEntries(running.map((r) => [r.name, r]));
    const filtered = all.filter((inst) => !inst.isManagement);
    const withStatus = [];
    for (const inst of filtered) {
      let config: Record<string, any> = {};
      try {
        config = JSON.parse(inst.configJson || "{}");
      } catch {}

      if (!config.wsPort && runningMap[inst.name]?.containerRunning) {
        await detectPorts(inst.name);
        try {
          const updated = await getDb().select().from(schema.instances).where(eq(schema.instances.name, inst.name)).get();
          if (updated) config = JSON.parse(updated.configJson || "{}");
        } catch {}
      }

      withStatus.push({
        ...inst,
        isManagement: inst.isManagement === 1,
        createdAt: inst.createdAt?.getTime() ?? 0,
        updatedAt: inst.updatedAt?.getTime() ?? 0,
        status: runningMap[inst.name]?.status || "stopped",
        containerRunning: runningMap[inst.name]?.containerRunning || false,
        vncPort: config.vncPort,
        wsPort: config.wsPort,
        bridgePort: config.bridgePort,
        vncUrl: config.vncPort
          ? `http://${process.env.HOST || "localhost"}:${config.vncPort}`
          : undefined,
        wsUrl: config.wsPort
          ? `http://${process.env.HOST || "localhost"}:${config.wsPort}`
          : undefined,
        apiUrl: config.bridgePort
          ? `http://${process.env.HOST || "localhost"}:${config.bridgePort}`
          : undefined,
        vncPassword: config.password,
      });
    }
    return c.json({ instances: withStatus });
  });

  app.openapi(createInstanceRoute, async (c) => {
    const { name, password: bodyPassword, isManagement } = c.req.valid("json");
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (existing) return c.json({ error: "Instance already exists" }, 409);

    const rows = await db.select().from(schema.instances).all();
    if (rows.length > MAX_INSTANCES) return c.json({ error: `Max limit (${MAX_INSTANCES})` }, 400);

    if (!checkImageExists()) {
      return c.json(
        {
          error:
            "Docker image mt5-tigervnc:latest not found. Build it first via Settings > Build Image.",
        },
        400,
      );
    }

    const instDir = `${INSTANCES_DIR}/${name}`;
    if (existsSync(instDir)) {
      rmSync(instDir, { recursive: true, force: true });
    }
    mkdirSync(`${instDir}/data`, { recursive: true });
    mkdirSync(`${instDir}/wine`, { recursive: true });

    const password = bodyPassword || randomBytes(8).toString("hex");

    ensureSharedDir();
    const composeContent = generateComposeContent(name, password, undefined, isManagement ?? false);

    writeFileSync(`${instDir}/docker-compose.yaml`, composeContent);

    try {
      execSync(`docker compose -f ${instDir}/docker-compose.yaml up -d`, {
        cwd: instDir,
        maxBuffer: 1024 * 1024,
      });
    } catch (err: any) {
      rmSync(instDir, { recursive: true, force: true });
      return c.json({ error: `Failed to start: ${String(err)}` }, 500);
    }

    const containerId = getContainerId(name);
    await db.insert(schema.instances).values({ name, status: "running", containerId, isManagement: isManagement ? 1 : 0 }).run();
    await detectPorts(name);

    const instFromDb = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    let config: any = {};
    if (instFromDb?.configJson) {
      try {
        config = JSON.parse(instFromDb.configJson);
      } catch {}
    }
    config.password = password;
    await db
      .update(schema.instances)
      .set({
        configJson: JSON.stringify(config),
        updatedAt: new Date(),
      })
      .where(eq(schema.instances.name, name))
      .run();

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_create", actorId, "instance", name, { name, status: "created" });
    emitSocketEvent("instance:event", { name, status: "running", containerRunning: true });

    return c.json({ status: "created", name }, 201);
  });

  app.openapi(getRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const inst = await getDb()
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);
    const running = listRunningContainers();
    const live = running.find((r) => r.name === name);
    let config: Record<string, any> = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}

    if (!config.wsPort && live?.containerRunning) {
      await detectPorts(name);
      try {
        const updated = await getDb().select().from(schema.instances).where(eq(schema.instances.name, name)).get();
        if (updated) config = JSON.parse(updated.configJson || "{}");
      } catch {}
    }

    return c.json({
      ...inst,
      isManagement: inst.isManagement === 1,
      createdAt: inst.createdAt?.getTime() ?? 0,
      updatedAt: inst.updatedAt?.getTime() ?? 0,
      status: live?.status || "stopped",
      containerRunning: live?.containerRunning || false,
      vncPort: config.vncPort,
      wsPort: config.wsPort,
      bridgePort: config.bridgePort,
      vncUrl: config.vncPort
        ? `http://${process.env.HOST || "localhost"}:${config.vncPort}`
        : undefined,
      wsUrl: config.wsPort
        ? `http://${process.env.HOST || "localhost"}:${config.wsPort}`
        : undefined,
      apiUrl: config.bridgePort
        ? `http://${process.env.HOST || "localhost"}:${config.bridgePort}`
        : undefined,
      vncPassword: config.password,
    });
  });

  app.openapi(deleteRoute, async (c) => {
    const { name } = c.req.valid("param");
    const inst = await getDb()
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst)
      return c.body(JSON.stringify({ error: "not found" }), 404, {
        "content-type": "application/json",
      }) as any;
    if (inst.isManagement === 1) {
      return c.json({ error: "Cannot delete management instance" }, 400);
    }
    const instDir = `${INSTANCES_DIR}/${name}`;
    try {
      execSync(`docker compose -f ${instDir}/docker-compose.yaml down`, {
        cwd: instDir,
        maxBuffer: 1024 * 1024,
      });
    } catch {}
    try {
      rmSync(instDir, { recursive: true, force: true });
    } catch {}
    await getDb().delete(schema.instances).where(eq(schema.instances.name, name)).run();

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_delete", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "stopped", containerRunning: false });

    return c.json({ status: "deleted", name });
  });

  app.openapi(startRoute, async (c) => {
    const { name } = c.req.valid("param");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const instDir = `${INSTANCES_DIR}/${name}`;
    const composePath = `${instDir}/docker-compose.yaml`;
    mkdirSync(instDir, { recursive: true });
    mkdirSync(`${instDir}/data`, { recursive: true });
    mkdirSync(`${instDir}/wine`, { recursive: true });

    let config: any = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}
    let existingLimits: any = {};
    try {
      existingLimits = JSON.parse(inst.resourceLimitsJson || "{}");
    } catch {}
    const password = config.password || process.env.PASSWORD || "changeme";

    const composeContent = generateComposeContent(name, password, existingLimits);
    writeFileSync(composePath, composeContent);

    execSync(`docker compose -f ${instDir}/docker-compose.yaml up -d`, {
      cwd: instDir,
      maxBuffer: 1024 * 1024,
    });

    const containerId = getContainerId(name);
    await db
      .update(schema.instances)
      .set({ status: "running", containerId, updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();
    await detectPorts(name);

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_start", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "running", containerRunning: true });

    return c.json({ status: "started" });
  });

  app.openapi(stopRoute, async (c) => {
    const { name } = c.req.valid("param");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const instDir = `${INSTANCES_DIR}/${name}`;
    const composePath = `${instDir}/docker-compose.yaml`;
    if (!existsSync(composePath)) {
      mkdirSync(instDir, { recursive: true });
      mkdirSync(`${instDir}/data`, { recursive: true });
      mkdirSync(`${instDir}/wine`, { recursive: true });
      let existingConfig: Record<string, any> = {};
      try {
        existingConfig = JSON.parse(inst.configJson || "{}");
      } catch {}
      const password = existingConfig.password || process.env.PASSWORD || "changeme";
      let existingLimits: Record<string, any> = {};
      try {
        existingLimits = JSON.parse(inst.resourceLimitsJson || "{}");
      } catch {}
      writeFileSync(composePath, generateComposeContent(name, password, existingLimits));
    }
    execSync(`docker compose -f ${instDir}/docker-compose.yaml down`, {
      cwd: instDir,
      maxBuffer: 1024 * 1024,
    });

    await db
      .update(schema.instances)
      .set({ status: "stopped", updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_stop", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "stopped", containerRunning: false });

    return c.json({ status: "stopped" });
  });

  app.openapi(restartRoute, async (c) => {
    const { name } = c.req.valid("param");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const instDir = `${INSTANCES_DIR}/${name}`;
    const composePath = `${instDir}/docker-compose.yaml`;
    mkdirSync(instDir, { recursive: true });
    mkdirSync(`${instDir}/data`, { recursive: true });
    mkdirSync(`${instDir}/wine`, { recursive: true });

    let config: any = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}
    let existingLimits: any = {};
    try {
      existingLimits = JSON.parse(inst.resourceLimitsJson || "{}");
    } catch {}
    const password = config.password || process.env.PASSWORD || "changeme";

    const composeContent = generateComposeContent(name, password, existingLimits);
    writeFileSync(composePath, composeContent);

    execSync(`docker compose -f ${instDir}/docker-compose.yaml up -d`, {
      cwd: instDir,
      maxBuffer: 1024 * 1024,
    });

    const containerId = getContainerId(name);
    await db
      .update(schema.instances)
      .set({ status: "running", containerId, updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();
    await detectPorts(name);

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_restart", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "running", containerRunning: true });

    return c.json({ status: "restarted" });
  });

  app.openapi(logsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const { tail } = c.req.valid("query");

    const inst = await getDb()
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const tailNum = tail ?? 100;
    const out = execSync(`docker logs --tail ${tailNum} ${name}`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });

    return c.json({ logs: out });
  });

  app.openapi(configGetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const inst = await getDb()
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    let config = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}

    return c.json(config);
  });

  app.openapi(configPutRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    let config: any = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}

    if (body.serverIni !== undefined) config.serverIni = body.serverIni;
    if (body.commonJson !== undefined) config.commonJson = body.commonJson;

    await db
      .update(schema.instances)
      .set({ configJson: JSON.stringify(config), updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();

    emitSocketEvent("instance:config", { name, config });

    return c.json({ status: "updated" });
  });

  app.openapi(limitsGetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const inst = await getDb()
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    let limits = {};
    try {
      limits = JSON.parse(inst.resourceLimitsJson || "{}");
    } catch {}

    return c.json(limits);
  });

  app.openapi(limitsPutRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    let limits: any = {};
    try {
      limits = JSON.parse(inst.resourceLimitsJson || "{}");
    } catch {}

    if (body.cpuShares !== undefined) limits.cpuShares = body.cpuShares;
    if (body.memoryLimit !== undefined) limits.memoryLimit = body.memoryLimit;

    await db
      .update(schema.instances)
      .set({ resourceLimitsJson: JSON.stringify(limits), updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();

    const instDir = `${INSTANCES_DIR}/${name}`;
    const composePath = `${instDir}/docker-compose.yaml`;
    if (existsSync(composePath)) {
      let config: any = {};
      try {
        config = JSON.parse(inst.configJson || "{}");
      } catch {}
      const password = config.password || process.env.PASSWORD || "changeme";
      const composeContent = generateComposeContent(name, password, {
        cpuShares: limits.cpuShares,
        memoryLimit: limits.memoryLimit,
      });
      writeFileSync(composePath, composeContent);

      if (inst.status === "running") {
        execSync(`docker compose -f ${composePath} up -d`, {
          cwd: instDir,
          maxBuffer: 1024 * 1024,
        });
      }
    }

    return c.json({ status: "updated" });
  });

  app.openapi(applyProfilesRoute, async (c) => {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const mt5Shared = join(SHARED_DIR, "MetaTrader 5");
    const details: Record<string, string> = {};

    if (body.chartSet) {
      const src = join(PROFILES_CHARTS_DIR, body.chartSet);
      const dst = join(mt5Shared, "Profiles", body.chartSet);
      if (!existsSync(src)) return c.json({ error: `chart set "${body.chartSet}" not found` }, 404);
      if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(src, dst, { recursive: true });
      details.chartSet = body.chartSet;
    }

    if (body.template) {
      const src = join(PROFILES_TEMPLATES_DIR, body.template);
      const dst = join(mt5Shared, "Templates", body.template);
      if (!existsSync(src)) return c.json({ error: `template "${body.template}" not found` }, 404);
      mkdirSync(join(mt5Shared, "Templates"), { recursive: true });
      writeFileSync(dst, readFileSync(src));
      details.template = body.template;
    }

    if (body.symbolSet) {
      const src = join(PROFILES_SYMBOLSETS_DIR, body.symbolSet);
      const dst = join(mt5Shared, "SymbolSets", body.symbolSet);
      if (!existsSync(src))
        return c.json({ error: `symbol set "${body.symbolSet}" not found` }, 404);
      mkdirSync(join(mt5Shared, "SymbolSets"), { recursive: true });
      writeFileSync(dst, readFileSync(src));
      details.symbolSet = body.symbolSet;
    }

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_profiles_apply", actorId, "instance", name, details);
    emitSocketEvent("instance:event", { name, status: "applied", containerRunning: true, details });

    return c.json({ status: "applied", details });
  });

  app.openapi(rebuildRoute, async (c) => {
    const { name } = c.req.valid("param");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    const _RUNTIME_DIR = process.env.RUNTIME_DIR || "/home/misu/mt5-manager/runtime";
    const { buildImage } = await import("../docker");
    const buildResult = buildImage();
    if (!buildResult.success) {
      return c.json({ error: `Rebuild failed: ${buildResult.output}` }, 500);
    }

    const instDir = `${INSTANCES_DIR}/${name}`;
    const composePath = `${instDir}/docker-compose.yaml`;

    let config: any = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}
    let existingLimits: any = {};
    try {
      existingLimits = JSON.parse(inst.resourceLimitsJson || "{}");
    } catch {}
    const password = config.password || process.env.PASSWORD || "changeme";

    writeFileSync(composePath, generateComposeContent(name, password, existingLimits));
    execSync(`docker compose -f ${composePath} up -d`, { cwd: instDir, maxBuffer: 1024 * 1024 });

    const containerId = getContainerId(name);
    await db
      .update(schema.instances)
      .set({ status: "running", containerId, updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();
    await detectPorts(name);

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_rebuild", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "restarting", containerRunning: true });

    return c.json({ status: "rebuilt" });
  });

  app.openapi(terminalRestartRoute, async (c) => {
    const { name } = c.req.valid("param");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    try {
      execSync(`docker exec ${name} pkill -f terminal64.exe`, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });
    } catch {}

    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    await logAudit("instance_terminal_restart", actorId, "instance", name, { name });
    emitSocketEvent("instance:event", { name, status: "running", containerRunning: true });

    return c.json({ status: "terminal restarted" });
  });

  app.openapi(execRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const { command } = c.req.valid("json");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

    try {
      const out = execSync(`docker exec ${name} sh -c ${JSON.stringify(command)}`, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });
      return c.json({ output: out.trim() });
    } catch (err: any) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.openapi(instanceMetricsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const { range } = c.req.valid("query");
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return c.json({ error: "not found" }, 404);

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

    if (bucket) {
      const bucketExpr =
        bucket === "5m"
          ? sql`strftime('%Y-%m-%dT%H:%M:00', ${schema.instanceMetrics.recordedAt} / 1000, 'unixepoch')`
          : bucket === "1h"
            ? sql`strftime('%Y-%m-%dT%H:00:00', ${schema.instanceMetrics.recordedAt} / 1000, 'unixepoch')`
            : sql`strftime('%Y-%m-%dT%H:00:00', (${schema.instanceMetrics.recordedAt} / 1000 / 21600) * 21600, 'unixepoch')`;

      const metrics = await db
        .select({
          bucket: bucketExpr.as("bucket"),
          cpuPercent: sql<number>`avg(${schema.instanceMetrics.cpuPercent})`.as("cpu_percent"),
          memoryPercent: sql<number>`avg(${schema.instanceMetrics.memoryPercent})`.as(
            "memory_percent",
          ),
          memoryUsageBytes: sql<number>`avg(${schema.instanceMetrics.memoryUsageBytes})`.as(
            "memory_usage_bytes",
          ),
          memoryLimitBytes: sql<number>`avg(${schema.instanceMetrics.memoryLimitBytes})`.as(
            "memory_limit_bytes",
          ),
          networkRxBytes: sql<number>`avg(${schema.instanceMetrics.networkRxBytes})`.as(
            "network_rx_bytes",
          ),
          networkTxBytes: sql<number>`avg(${schema.instanceMetrics.networkTxBytes})`.as(
            "network_tx_bytes",
          ),
          blockReadBytes: sql<number>`avg(${schema.instanceMetrics.blockReadBytes})`.as(
            "block_read_bytes",
          ),
          blockWriteBytes: sql<number>`avg(${schema.instanceMetrics.blockWriteBytes})`.as(
            "block_write_bytes",
          ),
          pidsCurrent: sql<number>`avg(${schema.instanceMetrics.pidsCurrent})`.as("pids_current"),
        })
        .from(schema.instanceMetrics)
        .where(
          and(
            eq(schema.instanceMetrics.instanceName, name),
            gte(schema.instanceMetrics.recordedAt, since),
          ),
        )
        .groupBy(bucketExpr)
        .orderBy(bucketExpr)
        .all();

      return c.json(
        metrics.map((m) => ({ ...m, recordedAt: new Date(m.bucket as string).getTime() })),
      );
    }

    const metrics = await db
      .select()
      .from(schema.instanceMetrics)
      .where(
        and(
          eq(schema.instanceMetrics.instanceName, name),
          gte(schema.instanceMetrics.recordedAt, since),
        ),
      )
      .orderBy(desc(schema.instanceMetrics.recordedAt))
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
