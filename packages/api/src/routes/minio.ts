import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getMinioConfig, saveMinioConfig, ensureBucket, getMinioClient } from "../minio";
import { getActorId, logAudit } from "../audit";

// Schema
const MinioConfigSchema = z.object({
  endpoint: z.string().openapi({ example: "minio:9000" }),
  accessKey: z.string().openapi({ example: "minioadmin" }),
  secretKey: z.string().openapi({ example: "minioadmin" }),
  bucket: z.string().openapi({ example: "mt5-configs" }),
  useSsl: z.boolean().optional().default(false),
  region: z.string().optional().default("us-east-1"),
});

const TestResultSchema = z.object({
  status: z.string(),
  bucketExists: z.boolean(),
  endpoint: z.string(),
  error: z.string().optional(),
});

// Routes
const getConfigRoute = createRoute({
  method: "get",
  path: "/minio/config",
  responses: {
    200: { content: { "application/json": { schema: MinioConfigSchema } }, description: "MinIO config" },
    404: { description: "Not configured" },
  },
});

const putConfigRoute = createRoute({
  method: "put",
  path: "/minio/config",
  request: { body: { content: { "application/json": { schema: MinioConfigSchema } } } },
  responses: {
    200: { content: { "application/json": { schema: MinioConfigSchema } }, description: "Config updated" },
  },
});

const testRoute = createRoute({
  method: "post",
  path: "/minio/test",
  responses: {
    200: { content: { "application/json": { schema: TestResultSchema } }, description: "Test result" },
  },
});

const setupRoute = createRoute({
  method: "post",
  path: "/minio/setup",
  request: { body: { content: { "application/json": { schema: MinioConfigSchema } } } },
  responses: {
    200: { content: { "application/json": { schema: TestResultSchema } }, description: "Setup result" },
  },
});

export function minioRoutes(app: OpenAPIHono) {
  app.openapi(getConfigRoute, async (c) => {
    const config = await getMinioConfig();
    if (!config) return c.json({ error: "MinIO not configured" }, 404);
    return c.json({
      endpoint: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      bucket: config.bucket,
      useSsl: config.useSsl,
      region: config.region,
    });
  });

  app.openapi(putConfigRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const body = c.req.valid("json");
    await saveMinioConfig({
      endpoint: body.endpoint,
      accessKey: body.accessKey,
      secretKey: body.secretKey,
      bucket: body.bucket,
      useSsl: body.useSsl ?? false,
      region: body.region ?? "us-east-1",
    });
    await logAudit("minio_config_update", actorId, "system", "minio", { endpoint: body.endpoint });
    return c.json(body);
  });

  app.openapi(testRoute, async (c) => {
    const config = await getMinioConfig();
    if (!config) return c.json({ status: "error", bucketExists: false, endpoint: "unknown", error: "MinIO not configured" }, 200);
    try {
      const mc = getMinioClient(config);
      const exists = await mc.bucketExists(config.bucket);
      return c.json({ status: exists ? "ok" : "bucket_missing", bucketExists: exists, endpoint: config.endpoint });
    } catch (err: any) {
      return c.json({ status: "error", bucketExists: false, endpoint: config.endpoint, error: err.message }, 200);
    }
  });

  app.openapi(setupRoute, async (c) => {
    const body = c.req.valid("json");
    try {
      await saveMinioConfig({
        endpoint: body.endpoint,
        accessKey: body.accessKey,
        secretKey: body.secretKey,
        bucket: body.bucket,
        useSsl: body.useSsl ?? false,
        region: body.region ?? "us-east-1",
      });
      await ensureBucket();
      return c.json({ status: "ok", bucketExists: true, endpoint: body.endpoint });
    } catch (err: any) {
      return c.json({ status: "error", bucketExists: false, endpoint: body.endpoint, error: err.message }, 200);
    }
  });
}
