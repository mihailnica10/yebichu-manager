import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { eq, getDb, schema } from "@mt5/db";
import { getActorId } from "../audit";
import { emitSocketEvent } from "../socket";

const ProfileSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
    metadataJson: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi("Profile");

const CreateProfileBody = z.object({
  name: z.string().min(1).openapi({ example: "Default" }),
  type: z.string().min(1).openapi({ example: "mt5" }),
  metadataJson: z.string().optional(),
});

const listRoute = createRoute({
  method: "get",
  path: "/profiles",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ profiles: z.array(ProfileSchema) }) } },
      description: "List profiles",
    },
    401: { description: "Unauthorized" },
  },
});

const createRoute_profiles = createRoute({
  method: "post",
  path: "/profiles",
  request: { body: { content: { "application/json": { schema: CreateProfileBody } } } },
  responses: {
    201: {
      content: { "application/json": { schema: ProfileSchema } },
      description: "Profile created",
    },
    401: { description: "Unauthorized" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/profiles/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: { "application/json": { schema: ProfileSchema } },
      description: "Profile details",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/profiles/{id}",
  request: {
    params: z.object({ id: z.coerce.number() }),
    body: { content: { "application/json": { schema: CreateProfileBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProfileSchema } },
      description: "Profile updated",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/profiles/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Profile deleted",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

export function profileRoutes(app: OpenAPIHono) {
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const all = await getDb().select().from(schema.profiles).all();
    return c.json({ profiles: all });
  });

  app.openapi(createRoute_profiles, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name, type, metadataJson } = c.req.valid("json");
    const db = getDb();
    const result = await db
      .insert(schema.profiles)
      .values({ name, type, metadataJson: metadataJson || "{}" })
      .returning()
      .get();
    emitSocketEvent("profiles:created", result);
    return c.json(result, 201);
  });

  app.openapi(getRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const profile = await getDb()
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, id))
      .get();
    if (!profile) return c.json({ error: "not found" }, 404);
    return c.json(profile);
  });

  app.openapi(updateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const { name, type, metadataJson } = c.req.valid("json");
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, id))
      .get();
    if (!existing) return c.json({ error: "not found" }, 404);

    const result = await db
      .update(schema.profiles)
      .set({ name, type, metadataJson: metadataJson || existing.metadataJson })
      .where(eq(schema.profiles.id, id))
      .returning()
      .get();
    emitSocketEvent("profiles:updated", result);
    return c.json(result);
  });

  app.openapi(deleteRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, id))
      .get();
    if (!existing) return c.json({ error: "not found" }, 404);

    await db.delete(schema.profiles).where(eq(schema.profiles.id, id)).run();
    emitSocketEvent("profiles:deleted", { id });
    return c.json({ status: "deleted" });
  });
}
