import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, getDb, schema } from "@mt5/db";
import { getActorId, logAudit } from "../audit";

const TemplateSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
    sourceInstance: z.string().nullable().optional(),
    fileCount: z.number().nullable().optional(),
    totalSize: z.number().nullable().optional(),
    createdAt: z.number().nullable().optional(),
    updatedAt: z.number().nullable().optional(),
  })
  .openapi("InstanceTemplate");

const CreateTemplateBody = z.object({
  name: z.string().min(1).max(128).openapi({ example: "My Template" }),
  description: z.string().optional(),
});

const UpdateTemplateBody = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().optional(),
});

const ApplyTemplateBody = z.object({
  instanceNames: z.array(z.string().min(1)),
});

const INSTANCES_DIR = process.env.INSTANCES_DIR || "/root/mt5/instances";
const SHARED_DIR = process.env.SHARED_DIR || "/root/mt5/shared";

const listRoute = createRoute({
  method: "get",
  path: "/instance-templates",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ templates: z.array(TemplateSchema) }) },
      },
      description: "List instance templates",
    },
    401: { description: "Unauthorized" },
  },
});

const createRoute_templates = createRoute({
  method: "post",
  path: "/instance-templates",
  request: { body: { content: { "application/json": { schema: CreateTemplateBody } } } },
  responses: {
    201: {
      content: { "application/json": { schema: TemplateSchema } },
      description: "Template created",
    },
    401: { description: "Unauthorized" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/instance-templates/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: { "application/json": { schema: TemplateSchema } },
      description: "Template details",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/instance-templates/{id}",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: { content: { "application/json": { schema: UpdateTemplateBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TemplateSchema } },
      description: "Template updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/instance-templates/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Template deleted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const captureRoute = createRoute({
  method: "post",
  path: "/instance-templates/{id}/capture",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            fileCount: z.number(),
            totalSize: z.number(),
          }),
        },
      },
      description: "Template captured",
    },
    400: { description: "Error" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const applyRoute = createRoute({
  method: "post",
  path: "/instance-templates/{id}/apply",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: { content: { "application/json": { schema: ApplyTemplateBody } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            instances: z.array(
              z.object({ name: z.string(), status: z.string() }),
            ),
          }),
        },
      },
      description: "Template applied",
    },
    400: { description: "Error" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const assignRoute = createRoute({
  method: "post",
  path: "/instance-templates/{id}/assign",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: { content: { "application/json": { schema: ApplyTemplateBody } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ status: z.string(), count: z.number() }),
        },
      },
      description: "Template assigned",
    },
    400: { description: "Error" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const unassignRoute = createRoute({
  method: "delete",
  path: "/instance-templates/{id}/assign/{instanceName}",
  request: {
    params: z.object({ id: z.coerce.number(), instanceName: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Template unassigned",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const filesRoute = createRoute({
  method: "get",
  path: "/instance-templates/{id}/files",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            files: z.array(z.object({ path: z.string(), size: z.number() })),
          }),
        },
      },
      description: "Template files",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

function listFilesRecursive(dir: string, baseDir: string): { path: string; size: number }[] {
  const results: { path: string; size: number }[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, fullPath);
      const stats = statSync(fullPath);
      results.push({ path: relPath, size: stats.size });
    }
  }
  return results;
}

function readFilesRecursive(dir: string, baseDir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  if (!existsSync(dir)) return files;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = readFilesRecursive(fullPath, baseDir);
      for (const [k, v] of sub) files.set(k, v);
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, fullPath);
      files.set(relPath, readFileSync(fullPath));
    }
  }
  return files;
}

export function instanceTemplateRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const db = getDb();
    const all = await db.select().from(schema.instanceTemplates).all();
    const templates = all.map((t) => ({
      ...t,
      createdAt: t.createdAt?.getTime() ?? 0,
      updatedAt: t.updatedAt?.getTime() ?? 0,
    }));
    return c.json({ templates });
  });

  app.openapi(createRoute_templates, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name, description } = c.req.valid("json");
    const db = getDb();
    const result = await db
      .insert(schema.instanceTemplates)
      .values({ name, description: description || null })
      .returning()
      .get();
    const mapped = {
      ...result,
      createdAt: result.createdAt?.getTime() ?? 0,
      updatedAt: result.updatedAt?.getTime() ?? 0,
    };
    return c.json(mapped, 201);
  });

  app.openapi(getRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const db = getDb();
    const template = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!template) return c.json({ error: "not found" }, 404);
    return c.json({
      ...template,
      createdAt: template.createdAt?.getTime() ?? 0,
      updatedAt: template.updatedAt?.getTime() ?? 0,
    });
  });

  app.openapi(updateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!existing) return c.json({ error: "not found" }, 404);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const result = await db
      .update(schema.instanceTemplates)
      .set(updates)
      .where(eq(schema.instanceTemplates.id, id))
      .returning()
      .get();
    return c.json({
      ...result,
      createdAt: result.createdAt?.getTime() ?? 0,
      updatedAt: result.updatedAt?.getTime() ?? 0,
    });
  });

  app.openapi(deleteRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!existing) return c.json({ error: "not found" }, 404);

    await db.delete(schema.instanceTemplates).where(eq(schema.instanceTemplates.id, id)).run();

    const templateDir = `${INSTANCES_DIR}/templates/${id}`;
    if (existsSync(templateDir)) {
      rmSync(templateDir, { recursive: true, force: true });
    }

    return c.json({ status: "deleted" });
  });

  app.openapi(captureRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const db = getDb();

    const template = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!template) return c.json({ error: "not found" }, 404);

    try {
      const mgmtStatus = execSync("docker inspect mt5-mgmt --format '{{.State.Status}}'", {
        encoding: "utf-8",
      }).trim();
      if (mgmtStatus !== "running") {
        return c.json({ error: "Management instance is not running" }, 400);
      }
    } catch {
      return c.json({ error: "Management instance is not running" }, 400);
    }

    let fileList: string[];
    try {
      const listOutput = execSync(
        "docker exec mt5-mgmt python3 /mt5-bridge/capture_template.py --list",
        { encoding: "utf-8" },
      ).trim();
      fileList = listOutput.split("\n").filter(Boolean);
    } catch (err: any) {
      return c.json({ error: `Capture list failed: ${String(err)}` }, 500);
    }

    const templateDir = `${INSTANCES_DIR}/templates/${id}`;
    const filesDir = `${templateDir}/files`;
    if (existsSync(filesDir)) {
      rmSync(filesDir, { recursive: true, force: true });
    }
    mkdirSync(filesDir, { recursive: true });

    let tarBuffer: Buffer;
    try {
      tarBuffer = execSync(
        "docker exec mt5-mgmt python3 /mt5-bridge/capture_template.py",
        { maxBuffer: 50 * 1024 * 1024 },
      );
    } catch (err: any) {
      return c.json({ error: `Capture failed: ${String(err)}` }, 500);
    }

    try {
      const tarPath = `${templateDir}/capture.tar.gz`;
      writeFileSync(tarPath, tarBuffer);
      execSync(`tar -xzf ${tarPath} -C ${filesDir}`);
      rmSync(tarPath);
    } catch (err: any) {
      return c.json({ error: `Extraction failed: ${String(err)}` }, 500);
    }

    const extractedFiles = readFilesRecursive(filesDir, filesDir);
    let totalSize = 0;
    for (const [, content] of extractedFiles) {
      totalSize += content.length;
    }
    const fileCount = fileList.length;

    await db
      .update(schema.instanceTemplates)
      .set({
        fileCount,
        totalSize,
        sourceInstance: "mt5-mgmt",
        updatedAt: new Date(),
      })
      .where(eq(schema.instanceTemplates.id, id))
      .run();

    await logAudit("template_capture", actorId, "template", String(id), {
      id,
      fileCount,
      totalSize,
    });

    return c.json({ status: "captured", fileCount, totalSize });
  });

  app.openapi(applyRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const { instanceNames } = c.req.valid("json");
    const db = getDb();

    const template = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!template) return c.json({ error: "not found" }, 404);

    const filesDir = `${INSTANCES_DIR}/templates/${id}/files`;
    if (!existsSync(filesDir)) {
      return c.json({ error: "No captured files found for this template" }, 400);
    }

    const templateFiles = readFilesRecursive(filesDir, filesDir);
    const mt5Shared = join(SHARED_DIR, "MetaTrader 5");
    const results: { name: string; status: string }[] = [];

    for (const instanceName of instanceNames) {
      try {
        const inst = await db
          .select()
          .from(schema.instances)
          .where(eq(schema.instances.name, instanceName))
          .get();
        if (!inst) {
          results.push({ name: instanceName, status: "instance not found" });
          continue;
        }

        for (const [relPath, content] of templateFiles) {
          const destPath = join(mt5Shared, relPath);
          mkdirSync(join(destPath, ".."), { recursive: true });
          writeFileSync(destPath, content);
        }

        try {
          execSync(`docker exec ${instanceName} pkill -f terminal64.exe 2>/dev/null || true`, {
            encoding: "utf-8",
          });
        } catch {}

        try {
          execSync(
            `docker exec ${instanceName} sh -c "cd '/config/.wine/drive_c/Program Files/MetaTrader 5' && wine terminal64.exe /portable /withdrawal:disabled &"`,
            { timeout: 10000 },
          );
        } catch {}

        await logAudit("template_apply", actorId, "template", String(id), {
          templateId: id,
          instanceName,
        });

        results.push({ name: instanceName, status: "applied" });
      } catch (err: any) {
        results.push({ name: instanceName, status: `error: ${String(err)}` });
      }
    }

    return c.json({ status: "completed", instances: results });
  });

  app.openapi(assignRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const { instanceNames } = c.req.valid("json");
    const db = getDb();

    const template = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!template) return c.json({ error: "not found" }, 404);

    let count = 0;
    for (const instanceName of instanceNames) {
      try {
        await db
          .insert(schema.templateAssignments)
          .values({ templateId: id, instanceName })
          .run();
        count++;
      } catch {
        // ignore duplicate assignments
      }
    }

    await logAudit("template_assign", actorId, "template", String(id), {
      templateId: id,
      instanceCount: count,
    });

    return c.json({ status: "assigned", count });
  });

  app.openapi(unassignRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id, instanceName } = c.req.valid("param");
    const db = getDb();

    const existing = await db
      .select()
      .from(schema.templateAssignments)
      .where(
        and(
          eq(schema.templateAssignments.templateId, id),
          eq(schema.templateAssignments.instanceName, instanceName),
        ),
      )
      .get();
    if (!existing) return c.json({ error: "not found" }, 404);

    await db
      .delete(schema.templateAssignments)
      .where(
        and(
          eq(schema.templateAssignments.templateId, id),
          eq(schema.templateAssignments.instanceName, instanceName),
        ),
      )
      .run();

    return c.json({ status: "deleted" });
  });

  app.openapi(filesRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const db = getDb();

    const template = await db
      .select()
      .from(schema.instanceTemplates)
      .where(eq(schema.instanceTemplates.id, id))
      .get();
    if (!template) return c.json({ error: "not found" }, 404);

    const filesDir = `${INSTANCES_DIR}/templates/${id}/files`;
    const files = listFilesRecursive(filesDir, filesDir);

    return c.json({ files });
  });
}
