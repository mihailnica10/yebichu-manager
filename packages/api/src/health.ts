import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";

const HealthResponse = z
  .object({
    status: z.string().openapi({ example: "ok" }),
    time: z.string().openapi({ example: "2025-01-01T00:00:00.000Z" }),
    version: z.string().openapi({ example: "1.0.0" }),
  })
  .openapi("HealthResponse");

const route = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponse } },
      description: "Health check",
    },
  },
});

export function healthRoutes(app: OpenAPIHono) {
  app.openapi(route, (c) => {
    return c.json({ status: "ok", time: new Date().toISOString(), version: "1.0.0" });
  });
}
