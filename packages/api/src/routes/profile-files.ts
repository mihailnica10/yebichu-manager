import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getActorId, logAudit } from "../audit";
import { getChartsDir, getTemplatesDir, getSymbolsetsDir } from "../shared/constants";

const FileInfoSchema = z.object({
  name: z.string().openapi({ example: "chart01.chr" }),
  size: z.number().openapi({ example: 1024 }),
});

const ChartSetSchema = z.object({
  name: z.string().openapi({ example: "Default" }),
  files: z.array(FileInfoSchema),
});

const ChartSetDetailSchema = z.object({
  name: z.string(),
  files: z.array(
    z.object({
      name: z.string(),
      content: z.string(),
    }),
  ),
});

const FileEntrySchema = z.object({
  name: z.string().min(1).openapi({ example: "chart01.chr" }),
  content: z.string().min(1).openapi({ example: "base64encoded..." }),
});

const TemplateSchema = z.object({
  name: z.string().openapi({ example: "ADX.tpl" }),
  size: z.number().openapi({ example: 2048 }),
});

const SymbolSetSchema = z.object({
  name: z.string().openapi({ example: "forex.major.set" }),
  size: z.number().openapi({ example: 512 }),
});

// ---- Charts ----

const listChartsRoute = createRoute({
  method: "get",
  path: "/profiles/charts",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ chartSets: z.array(ChartSetSchema) }) } },
      description: "List all chart sets",
    },
    401: { description: "Unauthorized" },
  },
});

const getChartRoute = createRoute({
  method: "get",
  path: "/profiles/charts/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: ChartSetDetailSchema } },
      description: "Chart set details with file contents",
    },
    401: { description: "Unauthorized" },
    404: { description: "Chart set not found" },
  },
});

const createChartRoute = createRoute({
  method: "post",
  path: "/profiles/charts/{name}",
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: { "application/json": { schema: z.object({ files: z.array(FileEntrySchema) }) } },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Chart set created",
    },
    401: { description: "Unauthorized" },
  },
});

const deleteChartRoute = createRoute({
  method: "delete",
  path: "/profiles/charts/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Chart set deleted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Chart set not found" },
  },
});

const uploadChartFileRoute = createRoute({
  method: "post",
  path: "/profiles/charts/{name}/upload",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), file: z.string() }) },
      },
      description: "File uploaded to chart set",
    },
    401: { description: "Unauthorized" },
    404: { description: "Chart set not found" },
  },
});

// ---- Templates ----

const listTemplatesRoute = createRoute({
  method: "get",
  path: "/profiles/templates",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ templates: z.array(TemplateSchema) }) } },
      description: "List all templates",
    },
    401: { description: "Unauthorized" },
  },
});

const getTemplateRoute = createRoute({
  method: "get",
  path: "/profiles/templates/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ name: z.string(), content: z.string() }) },
      },
      description: "Template file content (base64)",
    },
    401: { description: "Unauthorized" },
    404: { description: "Template not found" },
  },
});

const createTemplateRoute = createRoute({
  method: "post",
  path: "/profiles/templates",
  request: {
    body: {
      content: {
        "application/json": { schema: z.object({ name: z.string(), content: z.string() }) },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Template created",
    },
    401: { description: "Unauthorized" },
    409: { description: "Template already exists" },
  },
});

const putTemplateRoute = createRoute({
  method: "put",
  path: "/profiles/templates/{name}",
  request: {
    params: z.object({ name: z.string() }),
    body: { content: { "application/json": { schema: z.object({ content: z.string() }) } } },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Template updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Template not found" },
  },
});

const deleteTemplateRoute = createRoute({
  method: "delete",
  path: "/profiles/templates/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Template deleted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Template not found" },
  },
});

// ---- Symbol Sets ----

const listSymbolSetsRoute = createRoute({
  method: "get",
  path: "/profiles/symbol-sets",
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ symbolSets: z.array(SymbolSetSchema) }) },
      },
      description: "List all symbol sets",
    },
    401: { description: "Unauthorized" },
  },
});

const getSymbolSetRoute = createRoute({
  method: "get",
  path: "/profiles/symbol-sets/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ name: z.string(), content: z.string() }) },
      },
      description: "Symbol set content (base64)",
    },
    401: { description: "Unauthorized" },
    404: { description: "Symbol set not found" },
  },
});

const createSymbolSetRoute = createRoute({
  method: "post",
  path: "/profiles/symbol-sets",
  request: {
    body: {
      content: {
        "application/json": { schema: z.object({ name: z.string(), content: z.string() }) },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Symbol set created",
    },
    401: { description: "Unauthorized" },
    409: { description: "Symbol set already exists" },
  },
});

const putSymbolSetRoute = createRoute({
  method: "put",
  path: "/profiles/symbol-sets/{name}",
  request: {
    params: z.object({ name: z.string() }),
    body: { content: { "application/json": { schema: z.object({ content: z.string() }) } } },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ status: z.string(), name: z.string() }) },
      },
      description: "Symbol set updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Symbol set not found" },
  },
});

const deleteSymbolSetRoute = createRoute({
  method: "delete",
  path: "/profiles/symbol-sets/{name}",
  request: { params: z.object({ name: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Symbol set deleted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Symbol set not found" },
  },
});

export function profileFileRoutes(app: OpenAPIHono) {
  // ---- Charts ----

  app.openapi(listChartsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    ensureDir(getChartsDir());
    const sets = readdirSync(getChartsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        files: readdirSync(join(getChartsDir(), d.name)).map((f) => ({
          name: f,
          size: statSync(join(getChartsDir(), d.name, f)).size,
        })),
      }));
    return c.json({ chartSets: sets });
  });

  app.openapi(getChartRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const setDir = join(getChartsDir(), safeName);
    if (!existsSync(setDir)) return c.json({ error: "not found" }, 404);
    const files = readdirSync(setDir).map((f) => ({
      name: f,
      content: readFileSync(join(setDir, f)).toString("base64"),
    }));
    return c.json({ name, files });
  });

  app.openapi(createChartRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const { files } = c.req.valid("json");
    const setDir = join(getChartsDir(), safeName);
    mkdirSync(setDir, { recursive: true });
    for (const file of files) {
      writeFileSync(join(setDir, file.name), Buffer.from(file.content, "base64"));
    }
    await logAudit("profile_charts_create", actorId, "profile", name, {
      files: files.map((f: any) => f.name),
    });
    return c.json({ status: "created", name }, 201);
  });

  app.openapi(deleteChartRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const setDir = join(getChartsDir(), safeName);
    if (!existsSync(setDir)) return c.json({ error: "not found" }, 404);
    rmSync(setDir, { recursive: true, force: true });
    await logAudit("profile_charts_delete", actorId, "profile", name, { name });
    return c.json({ status: "deleted" });
  });

  app.openapi(uploadChartFileRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const setDir = join(getChartsDir(), safeName);
    if (!existsSync(setDir)) return c.json({ error: "not found" }, 404);

    const body = await c.req.parseBody();
    const file = body.file as File | undefined;
    if (!file) return c.json({ error: "no file provided" }, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(setDir, file.name), buffer);

    await logAudit("profile_charts_upload", actorId, "profile", name, { file: file.name });
    return c.json({ status: "uploaded", file: file.name });
  });

  // ---- Templates ----

  app.openapi(listTemplatesRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    ensureDir(getTemplatesDir());
    const templates = listDirWithStats(getTemplatesDir());
    return c.json({ templates });
  });

  app.openapi(getTemplateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const filePath = join(getTemplatesDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    const content = readFileSync(filePath).toString("base64");
    return c.json({ name, content });
  });

  app.openapi(createTemplateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name, content } = c.req.valid("json");
    const filePath = join(getTemplatesDir(), name);
    if (existsSync(filePath)) return c.json({ error: "template already exists" }, 409);
    ensureDir(getTemplatesDir());
    writeFileSync(filePath, Buffer.from(content, "base64"));
    await logAudit("profile_template_create", actorId, "profile", name, { name });
    return c.json({ status: "created", name }, 201);
  });

  app.openapi(putTemplateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const { content } = c.req.valid("json");
    const filePath = join(getTemplatesDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    writeFileSync(filePath, Buffer.from(content, "base64"));
    await logAudit("profile_template_update", actorId, "profile", name, { name });
    return c.json({ status: "updated", name });
  });

  app.openapi(deleteTemplateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const filePath = join(getTemplatesDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    rmSync(filePath, { force: true });
    await logAudit("profile_template_delete", actorId, "profile", name, { name });
    return c.json({ status: "deleted" });
  });

  // ---- Symbol Sets ----

  app.openapi(listSymbolSetsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    ensureDir(getSymbolsetsDir());
    const symbolSets = listDirWithStats(getSymbolsetsDir());
    return c.json({ symbolSets });
  });

  app.openapi(getSymbolSetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const filePath = join(getSymbolsetsDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    const content = readFileSync(filePath).toString("base64");
    return c.json({ name, content });
  });

  app.openapi(createSymbolSetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name, content } = c.req.valid("json");
    const filePath = join(getSymbolsetsDir(), name);
    if (existsSync(filePath)) return c.json({ error: "symbol set already exists" }, 409);
    ensureDir(getSymbolsetsDir());
    writeFileSync(filePath, Buffer.from(content, "base64"));
    await logAudit("profile_symbolset_create", actorId, "profile", name, { name });
    return c.json({ status: "created", name }, 201);
  });

  app.openapi(putSymbolSetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const { content } = c.req.valid("json");
    const filePath = join(getSymbolsetsDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    writeFileSync(filePath, Buffer.from(content, "base64"));
    await logAudit("profile_symbolset_update", actorId, "profile", name, { name });
    return c.json({ status: "updated", name });
  });

  app.openapi(deleteSymbolSetRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name } = c.req.valid("param");
    const safeName = sanitizeProfileName(name);
    if (!safeName) return c.json({ error: "invalid name" }, 400);
    const filePath = join(getSymbolsetsDir(), safeName);
    if (!existsSync(filePath)) return c.json({ error: "not found" }, 404);
    rmSync(filePath, { force: true });
    await logAudit("profile_symbolset_delete", actorId, "profile", name, { name });
    return c.json({ status: "deleted" });
  });
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function listDirWithStats(dir: string) {
  try {
    return readdirSync(dir).map((f) => ({
      name: f,
      size: statSync(join(dir, f)).size,
    }));
  } catch {
    return [];
  }
}

function sanitizeProfileName(name: string): string | null {
  const safe = basename(name);
  if (safe.includes("..") || safe.startsWith("/")) return null;
  return safe;
}
