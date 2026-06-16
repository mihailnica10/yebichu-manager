import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { eq, getDb, schema } from "@mt5/db";
import { getActorId, logAudit } from "../audit";
import { checkDockerAvailable, checkImageExists } from "../docker";

const INSTANCES_DIR = process.env.INSTANCES_DIR || "/root/mt5/instances";
const SHARED_DIR = process.env.SHARED_DIR || "/root/mt5/shared";
const RUNTIME_DIR = process.env.RUNTIME_DIR || "/home/misu/mt5-manager/runtime";
const BRIDGE_SRC = process.env.BRIDGE_SRC || "/home/misu/mt5-manager/scripts/mt5-bridge";

const StatusResponse = z
  .object({
    hasUsers: z.boolean(),
    dockerAvailable: z.boolean(),
    imageExists: z.boolean(),
    hasManagementInstance: z.boolean(),
    managementInstanceName: z.string().nullable(),
    completed: z.boolean(),
  })
  .openapi("SetupStatus");

const CompleteBody = z
  .object({
    managementInstanceName: z.string().optional(),
  })
  .openapi("SetupCompleteBody");

const ManagementInstanceResponse = z
  .object({
    name: z.string(),
    status: z.string(),
    containerRunning: z.boolean(),
    containerId: z.string().nullable(),
    vncPort: z.number().optional(),
    wsPort: z.number().optional(),
    bridgePort: z.number().optional(),
    vncUrl: z.string().optional(),
    wsUrl: z.string().optional(),
    apiUrl: z.string().optional(),
    vncPassword: z.string().optional(),
  })
  .openapi("ManagementInstanceResponse");

const statusRoute = createRoute({
  method: "get",
  path: "/setup/status",
  responses: {
    200: {
      content: { "application/json": { schema: StatusResponse } },
      description: "Setup status",
    },
  },
});

const completeRoute = createRoute({
  method: "post",
  path: "/setup/complete",
  request: { body: { content: { "application/json": { schema: CompleteBody } } } },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Setup marked complete",
    },
    401: { description: "Unauthorized" },
  },
});

const managementInstanceRoute = createRoute({
  method: "post",
  path: "/setup/management-instance",
  responses: {
    201: {
      content: { "application/json": { schema: ManagementInstanceResponse } },
      description: "Management instance created",
    },
    400: { description: "Docker or image not available" },
    401: { description: "Unauthorized" },
    500: { description: "Creation failed" },
  },
});

function generateMgmtComposeContent(name: string, password: string): string {
  const instDir = `${INSTANCES_DIR}/${name}`;
  return `services:
  ${name}:
    image: mt5-tigervnc:latest
    container_name: ${name}
    restart: unless-stopped
    network_mode: bridge
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
      - MANAGEMENT_MODE=true
      - DISPLAY=:1
      - ENABLE_FILEBROWSER=false
      - ENABLE_API=true
      - BRIDGE_PORT=8090
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp=unconfined
    stdin_open: true
    tty: true
`;
}

function getContainerId(name: string): string {
  try {
    return execSync(`docker inspect --format '{{.Id}}' ${name}`, { encoding: "utf-8" }).trim();
  } catch {
    return name;
  }
}

async function detectPortsForInstance(name: string) {
  try {
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return null;

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

    return config;
  } catch {
    return null;
  }
}

export function setupRoutes(app: OpenAPIHono) {
  app.openapi(statusRoute, async (c) => {
    const db = getDb();
    const users = await db.select().from(schema.users).all();
    const hasUsers = users.length > 0;

    const dockerAvailable = checkDockerAvailable();
    const imageExists = checkImageExists();

    const setupStateRow = await db
      .select()
      .from(schema.setupState)
      .where(eq(schema.setupState.id, 1))
      .get();
    const completed = setupStateRow?.completed === 1;

    const mgmtInstance = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.isManagement, 1))
      .get();
    const hasManagementInstance = !!mgmtInstance;
    const managementInstanceName = mgmtInstance?.name ?? null;

    return c.json({
      hasUsers,
      dockerAvailable,
      imageExists,
      hasManagementInstance,
      managementInstanceName,
      completed,
    });
  });

  app.openapi(completeRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    const { managementInstanceName } = c.req.valid("json");
    const db = getDb();

    const existing = await db
      .select()
      .from(schema.setupState)
      .where(eq(schema.setupState.id, 1))
      .get();

    if (existing) {
      await db
        .update(schema.setupState)
        .set({
          completed: 1,
          managementInstanceName: managementInstanceName ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.setupState.id, 1))
        .run();
    } else {
      await db
        .insert(schema.setupState)
        .values({
          id: 1,
          completed: 1,
          managementInstanceName: managementInstanceName ?? null,
        })
        .run();
    }

    await logAudit("setup_complete", actorId, "setup", "1", {
      managementInstanceName,
    });

    return c.json({ status: "ok" });
  });

  app.openapi(managementInstanceRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    if (!checkDockerAvailable()) {
      return c.json({ error: "Docker is not available" }, 400);
    }

    if (!checkImageExists()) {
      return c.json({ error: "Docker image mt5-tigervnc:latest not found" }, 400);
    }

    const name = "mt5-mgmt";
    const db = getDb();

    const existing = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (existing) {
      // Check if container is actually running
      try {
        const state = execSync(`docker inspect --format '{{.State.Status}}' ${name}`, {
          encoding: "utf-8",
        }).trim();
        if (state === "running") {
          // Container running — detect ports and return info
          const config = (await detectPortsForInstance(name)) || {};
          return c.json(
            {
              name,
              status: "running",
              containerRunning: true,
              containerId: existing.containerId,
              vncPort: config.vncPort,
              wsPort: config.wsPort,
              bridgePort: config.bridgePort,
              vncUrl: config.vncPort ? `http://localhost:${config.vncPort}` : undefined,
              wsUrl: config.wsPort ? `http://localhost:${config.wsPort}` : undefined,
              vncPassword: config.password,
            },
            200,
          );
        }
      } catch {
        // Container doesn't exist — fall through to recreate
      }
      // Container not running — remove stale DB entry and recreate
      await db.delete(schema.instances).where(eq(schema.instances.name, name)).run();
    }

    const instDir = `${INSTANCES_DIR}/${name}`;
    if (existsSync(instDir)) {
      execSync(`rm -rf ${instDir}`, { stdio: "ignore" });
    }
    mkdirSync(`${instDir}/data`, { recursive: true });
    mkdirSync(`${instDir}/wine`, { recursive: true });

    if (!existsSync(SHARED_DIR)) {
      mkdirSync(SHARED_DIR, { recursive: true });
    }

    const password = randomBytes(8).toString("hex");
    const composeContent = generateMgmtComposeContent(name, password);
    writeFileSync(`${instDir}/docker-compose.yaml`, composeContent);

    try {
      execSync(`docker compose -f ${instDir}/docker-compose.yaml up -d`, {
        cwd: instDir,
        maxBuffer: 1024 * 1024,
        encoding: "utf-8",
      });
    } catch (err: any) {
      rmSync(instDir, { recursive: true, force: true });
      return c.json({ error: `Failed to start: ${err.stderr || err.message}` }, 500);
    }

    for (let i = 0; i < 15; i++) {
      try {
        execSync(`docker inspect ${name}`, { encoding: "utf-8" });
        break;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const containerId = getContainerId(name);
    await db
      .insert(schema.instances)
      .values({ name, status: "running", containerId, isManagement: 1 })
      .run();

    let config = (await detectPortsForInstance(name)) || {};
    let portDetectionAttempts = 0;
    while (!config.wsPort && portDetectionAttempts < 10) {
      await new Promise(r => setTimeout(r, 1000));
      const updated = await detectPortsForInstance(name);
      if (updated) config = updated;
      portDetectionAttempts++;
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

    await logAudit("management_instance_create", actorId, "instance", name, { name });

    const host = process.env.HOST || "localhost";

    return c.json(
      {
        name,
        status: "running",
        containerRunning: true,
        containerId,
        vncPort: config.vncPort,
        wsPort: config.wsPort,
        bridgePort: config.bridgePort,
        vncUrl: config.vncPort ? `http://${host}:${config.vncPort}` : undefined,
        wsUrl: config.wsPort ? `http://${host}:${config.wsPort}` : undefined,
        apiUrl: config.bridgePort ? `http://${host}:${config.bridgePort}` : undefined,
        vncPassword: password,
      },
      201,
    );
  });
}
