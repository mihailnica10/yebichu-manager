import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getActorId } from "../audit";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const MT5_BASE = '/config/.wine/drive_c/Program Files/MetaTrader 5';

function sanitizePath(input: string): string {
  const cleaned = input.replace(/^\/+|\/+$/g, "");
  if (cleaned.includes("..")) throw new Error("Invalid path");
  return cleaned;
}

function buildContainerPath(relativePath: string): string {
  const safe = sanitizePath(relativePath);
  return safe ? `${MT5_BASE}/${safe}` : MT5_BASE;
}

const listRoute = createRoute({
  method: "get",
  path: "/mgmt/files",
  request: {
    query: z.object({
      path: z.string().optional().default(""),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "Directory listing",
    },
    401: { description: "Unauthorized" },
    400: { description: "Invalid path" },
    404: { description: "Path not found" },
    500: { description: "Server error" },
  },
});

const uploadRoute = createRoute({
  method: "post",
  path: "/mgmt/files/upload",
  request: {
    query: z.object({
      path: z.string().optional().default(""),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "Upload response",
    },
    401: { description: "Unauthorized" },
    400: { description: "Invalid path or no files" },
    500: { description: "Upload failed" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/mgmt/files",
  request: {
    query: z.object({
      path: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "Delete response",
    },
    401: { description: "Unauthorized" },
    400: { description: "Invalid path" },
    500: { description: "Delete failed" },
  },
});

const downloadRoute = createRoute({
  method: "get",
  path: "/mgmt/files/download",
  request: {
    query: z.object({
      path: z.string(),
    }),
  },
  responses: {
    200: { description: "File download" },
    401: { description: "Unauthorized" },
    400: { description: "Invalid path" },
    404: { description: "File not found" },
    500: { description: "Download failed" },
  },
});

const mkdirRoute = createRoute({
  method: "post",
  path: "/mgmt/files/mkdir",
  request: {
    query: z.object({
      path: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.any() } },
      description: "Mkdir response",
    },
    401: { description: "Unauthorized" },
    400: { description: "Invalid path" },
    500: { description: "Failed to create directory" },
  },
});

export function mgmtFileRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    try {
      const queryPath = c.req.valid("query").path || "";
      const safePath = sanitizePath(queryPath);
      const containerPath = buildContainerPath(safePath);

      const lsOut = execSync(
        `docker exec mt5-mgmt ls -la "${containerPath}/"`,
        { encoding: "utf-8", maxBuffer: 1024 * 1024 },
      );

      const lines = lsOut.trim().split("\n");
      const entries: Array<{
        name: string;
        type: "file" | "dir";
        size?: number;
        modifiedAt?: number;
      }> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("total")) continue;

        const typeChar = trimmed[0];
        if (typeChar !== "d" && typeChar !== "-" && typeChar !== "l") continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 9) continue;

        const rawName = parts.slice(8).join(" ");
        if (rawName === "." || rawName === "..") continue;

        if (typeChar === "d") {
          entries.push({ name: rawName, type: "dir" });
        } else if (typeChar === "l") {
          const name = rawName.split(" -> ")[0].trim();
          if (name === "." || name === "..") continue;
          let isDir = false;
          try {
            execSync(
              `docker exec mt5-mgmt test -d "${containerPath}/${name}"`,
              { encoding: "utf-8", maxBuffer: 1024 * 1024 },
            );
            isDir = true;
          } catch {
            isDir = false;
          }
          if (isDir) {
            entries.push({ name, type: "dir" });
          } else {
            const size = parseInt(parts[4], 10);
            try {
              const statOut = execSync(
                `docker exec mt5-mgmt stat -c "%s %Y" "${containerPath}/${name}"`,
                { encoding: "utf-8", maxBuffer: 1024 * 1024 },
              );
              const [statSize, statMtime] = statOut.trim().split(" ");
              entries.push({
                name,
                type: "file",
                size: parseInt(statSize, 10),
                modifiedAt: parseInt(statMtime, 10) * 1000,
              });
            } catch {
              entries.push({ name, type: "file", size });
            }
          }
        } else {
          const name = rawName;
          const size = parseInt(parts[4], 10);
          try {
            const statOut = execSync(
              `docker exec mt5-mgmt stat -c "%s %Y" "${containerPath}/${name}"`,
              { encoding: "utf-8", maxBuffer: 1024 * 1024 },
            );
            const [statSize, statMtime] = statOut.trim().split(" ");
            entries.push({
              name,
              type: "file",
              size: parseInt(statSize, 10),
              modifiedAt: parseInt(statMtime, 10) * 1000,
            });
          } catch {
            entries.push({ name, type: "file", size });
          }
        }
      }

      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return c.json({ path: safePath, entries });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("No such file or directory") || msg.includes("Cannot find")) {
        return c.json({ error: "Path not found" }, 404);
      }
      return c.json({ error: msg || "Failed to list directory" }, 500);
    }
  });

  app.openapi(uploadRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    try {
      const targetPath = c.req.valid("query").path || "";
      const safeTarget = sanitizePath(targetPath);
      const containerTarget = buildContainerPath(safeTarget);

      const body = await c.req.parseBody();
      const filesField = body["files"];

      let filesArray: File[] = [];
      if (Array.isArray(filesField)) {
        filesArray = filesField as File[];
      } else if (filesField) {
        filesArray = [filesField as File];
      }

      if (filesArray.length === 0) {
        return c.json({ error: "no files provided" }, 400);
      }

      const uploaded: Array<{ name: string; size: number }> = [];

      for (const file of filesArray) {
        const rawName = file.name || "unnamed";
        const safeName = rawName.replace(/\.\./g, "").replace(/\//g, "");
        if (!safeName) continue;

        const buffer = Buffer.from(await file.arrayBuffer());
        const tmpFile = `/tmp/mgmt-upload-${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

        try {
          writeFileSync(tmpFile, buffer);
          execSync(
            `docker cp "${tmpFile}" "mt5-mgmt:${containerTarget}/${safeName}"`,
            { encoding: "utf-8", maxBuffer: 1024 * 1024 },
          );
          uploaded.push({ name: safeName, size: buffer.length });
        } finally {
          if (existsSync(tmpFile)) rmSync(tmpFile);
        }
      }

      return c.json({ uploaded: uploaded.length, files: uploaded });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg || "Upload failed" }, 500);
    }
  });

  app.openapi(deleteRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    try {
      const queryPath = c.req.valid("query").path;
      if (!queryPath) return c.json({ error: "path is required" }, 400);

      const safePath = sanitizePath(queryPath);
      const containerPath = buildContainerPath(safePath);

      execSync(
        `docker exec mt5-mgmt rm -rf "${containerPath}"`,
        { encoding: "utf-8", maxBuffer: 1024 * 1024 },
      );

      return c.json({ status: "deleted" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg || "Delete failed" }, 500);
    }
  });

  app.openapi(downloadRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    try {
      const queryPath = c.req.valid("query").path;
      if (!queryPath) return c.json({ error: "path is required" }, 400);

      const safePath = sanitizePath(queryPath);
      const containerPath = buildContainerPath(safePath);
      const fileName = safePath.split("/").pop() || "file";

      const tmpFile = `/tmp/mgmt-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      try {
        execSync(
          `docker cp "mt5-mgmt:${containerPath}" "${tmpFile}"`,
          { encoding: "utf-8", maxBuffer: 1024 * 1024 },
        );
      } catch {
        return c.json({ error: "File not found" }, 404);
      }

      if (!existsSync(tmpFile)) {
        return c.json({ error: "File not found" }, 404);
      }

      const content = readFileSync(tmpFile);
      rmSync(tmpFile);

      return new Response(content, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": content.length.toString(),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg || "Download failed" }, 500);
    }
  });

  app.openapi(mkdirRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);

    try {
      const queryPath = c.req.valid("query").path;
      if (!queryPath) return c.json({ error: "path is required" }, 400);

      const safePath = sanitizePath(queryPath);
      const containerPath = buildContainerPath(safePath);

      execSync(
        `docker exec mt5-mgmt mkdir -p "${containerPath}"`,
        { encoding: "utf-8", maxBuffer: 1024 * 1024 },
      );

      return c.json({ status: "created" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg || "Failed to create directory" }, 500);
    }
  });
}
