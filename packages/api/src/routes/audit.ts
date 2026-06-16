import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq, getDb, schema, sql } from "@mt5/db";
import { getActorId } from "../audit";

const AuditLogEntrySchema = z
  .object({
    id: z.number(),
    action: z.string(),
    actorId: z.number().nullable().optional(),
    actorName: z.string().nullable().optional(),
    actorEmail: z.string().nullable().optional(),
    targetType: z.string().nullable().optional(),
    targetId: z.string().nullable().optional(),
    detailsJson: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi("AuditLogEntry");

const listRoute = createRoute({
  method: "get",
  path: "/audit-log",
  request: {
    query: z.object({
      limit: z.coerce.number().optional().openapi({ example: 50 }),
      offset: z.coerce.number().optional().openapi({ example: 0 }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            entries: z.array(AuditLogEntrySchema),
            total: z.number(),
          }),
        },
      },
      description: "Audit log entries",
    },
    401: { description: "Unauthorized" },
  },
});

export function auditLogRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { limit, offset } = c.req.valid("query");
    const db = getDb();
    const limitNum = limit ?? 50;
    const offsetNum = offset ?? 0;

    const entries = await db
      .select({
        id: schema.auditLog.id,
        action: schema.auditLog.action,
        actorId: schema.auditLog.actorId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        targetType: schema.auditLog.targetType,
        targetId: schema.auditLog.targetId,
        detailsJson: schema.auditLog.detailsJson,
        createdAt: schema.auditLog.createdAt,
      })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.auditLog.actorId, schema.users.id))
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limitNum)
      .offset(offsetNum)
      .all();

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.auditLog)
      .get()
      .then((r) => r?.count ?? 0);

    return c.json({ entries, total });
  });
}
