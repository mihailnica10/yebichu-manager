import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getDb, schema } from "@mt5/db";
import { getActorId } from "../audit";
import { buildImage, checkDockerAvailable, checkImageExists, getDockerVersion } from "../docker";

const INSTANCES_DIR = process.env.INSTANCES_DIR || "/root/mt5/instances";
const DB_PATH = process.env.DB_PATH || "/tmp/mt5-manager.db";

const StatusResponse = z
  .object({
    docker: z.object({
      available: z.boolean(),
      version: z.string(),
    }),
    image: z.object({
      exists: z.boolean(),
      tag: z.string(),
    }),
    instances: z.object({
      count: z.number(),
      max: z.number(),
      dir: z.string(),
    }),
    db: z.object({
      path: z.string(),
      size: z.number(),
    }),
  })
  .openapi("InstallStatus");

const statusRoute = createRoute({
  method: "get",
  path: "/install/status",
  responses: {
    200: {
      content: { "application/json": { schema: StatusResponse } },
      description: "Installation status",
    },
    401: { description: "Unauthorized" },
  },
});

const buildImageRoute = createRoute({
  method: "post",
  path: "/install/build-image",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), duration: z.number() }) },
      },
      description: "Image built",
    },
    401: { description: "Unauthorized" },
    500: { description: "Build failed" },
  },
});

const CheckDockerResponse = z
  .object({
    status: z.string(),
    version: z.string(),
    containers: z.number(),
    running: z.number(),
    images: z.number(),
  })
  .openapi("CheckDockerResponse");

const checkDockerRoute = createRoute({
  method: "post",
  path: "/install/check-docker",
  responses: {
    200: {
      content: { "application/json": { schema: CheckDockerResponse } },
      description: "Docker available",
    },
    401: { description: "Unauthorized" },
    503: { description: "Docker not available" },
  },
});

export function installRoutes(app: OpenAPIHono) {
  app.openapi(statusRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const dockerAvailable = checkDockerAvailable();
    const imageExists = checkImageExists();
    const version = getDockerVersion();

    let dbSize = 0;
    try {
      dbSize = statSync(DB_PATH).size;
    } catch {}

    const rows = await getDb().select().from(schema.instances).all();
    const max = Number.parseInt(process.env.MAX_INSTANCES || "10");

    return c.json({
      docker: { available: dockerAvailable, version },
      image: { exists: imageExists, tag: "mt5-tigervnc:latest" },
      instances: { count: rows.length, max, dir: INSTANCES_DIR },
      db: { path: DB_PATH, size: dbSize },
    });
  });

  app.openapi(buildImageRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const start = Date.now();
    const result = buildImage();
    const duration = Date.now() - start;

    if (result.success) {
      return c.json({ status: "built", duration });
    }

    return c.json({ error: `Build failed: ${result.output}` }, 500);
  });

  app.openapi(checkDockerRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    try {
      const version = execSync("docker info --format '{{.ServerVersion}}'", {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }).trim();

      const containersOut = execSync("docker info --format '{{.Containers}}'", {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }).trim();

      const runningOut = execSync("docker info --format '{{.ContainersRunning}}'", {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }).trim();

      const imagesOut = execSync("docker info --format '{{.Images}}'", {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }).trim();

      return c.json({
        status: "ok",
        version,
        containers: Number.parseInt(containersOut) || 0,
        running: Number.parseInt(runningOut) || 0,
        images: Number.parseInt(imagesOut) || 0,
      });
    } catch (err: any) {
      return c.json({ error: "Docker not available", details: String(err) }, 503);
    }
  });
}
