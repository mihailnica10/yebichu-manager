import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { eq, getDb, schema, hashPassword, verifyPassword } from "@mt5/db";
import { getActorId, logAudit } from "../audit";

const SignInBody = z.object({
  email: z.string().email().openapi({ example: "admin@mt5.local" }),
  password: z.string().min(1).openapi({ example: "admin123" }),
});

const SignUpBody = z.object({
  email: z.string().email().openapi({ example: "admin@mt5.local" }),
  name: z.string().min(1).openapi({ example: "Admin" }),
  password: z.string().min(6).openapi({ example: "admin123" }),
});

const UserSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    email: z.string().openapi({ example: "admin@mt5.local" }),
    name: z.string().openapi({ example: "Admin" }),
  })
  .openapi("User");

const SessionResponse = z
  .object({
    user: UserSchema.nullable(),
  })
  .openapi("SessionResponse");

const signInRoute = createRoute({
  method: "post",
  path: "/auth/sign-in",
  request: { body: { content: { "application/json": { schema: SignInBody } } } },
  responses: {
    200: {
      content: { "application/json": { schema: SessionResponse } },
      description: "Sign in success",
    },
    401: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Invalid credentials",
    },
  },
});

const SignUpResponse = z
  .object({
    user: UserSchema,
  })
  .openapi("SignUpResponse");

const signUpRoute = createRoute({
  method: "post",
  path: "/auth/sign-up",
  request: { body: { content: { "application/json": { schema: SignUpBody } } } },
  responses: {
    201: {
      content: { "application/json": { schema: SignUpResponse } },
      description: "Sign up success",
    },
    400: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "Setup already completed",
    },
  },
});

const signOutRoute = createRoute({
  method: "post",
  path: "/auth/sign-out",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Sign out success",
    },
  },
});

const sessionRoute = createRoute({
  method: "get",
  path: "/auth/session",
  responses: {
    200: {
      content: { "application/json": { schema: SessionResponse } },
      description: "Current session",
    },
  },
});

export function authRoutes(app: OpenAPIHono) {
  app.openapi(signInRoute, async (c) => {
    const { email, password } = c.req.valid("json");
    const db = getDb();
    const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
    if (!user) {
      const users = await db.select().from(schema.users).all();
      if (users.length === 0) {
        return c.json({ error: "No users found. Please complete the setup wizard first." }, 401);
      }
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) return c.json({ error: "Invalid email or password" }, 401);

    const token = crypto.randomUUID();
    await db
      .insert(schema.sessions)
      .values({
        id: token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .run();

    await logAudit("sign_in", user.id, "user", String(user.id), { email: user.email });

return c.json({ user: { id: user.id, email: user.email, name: user.name } }, 200, {
      "Set-Cookie": `mt5.session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
    });
  });

  app.openapi(signUpRoute, async (c) => {
    const { email, name, password } = c.req.valid("json");
    const db = getDb();

    const existingUsers = await db.select().from(schema.users).all();
    if (existingUsers.length > 0) {
      return c.json({ error: "Setup already completed" }, 400);
    }

    const passwordHash = hashPassword(password);
    const inserted = await db
      .insert(schema.users)
      .values({ email, name, passwordHash })
      .returning()
      .get();

    const token = crypto.randomUUID();
    await db
      .insert(schema.sessions)
      .values({
        id: token,
        userId: inserted.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .run();

    await logAudit("sign_up", inserted.id, "user", String(inserted.id), { email: inserted.email });

    return c.json({ user: { id: inserted.id, email: inserted.email, name: inserted.name } }, 201, {
      "Set-Cookie": `mt5.session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
    });
  });

  app.openapi(signOutRoute, async (c) => {
    const token = c.req.header("cookie")?.match(/mt5\.session=([^;]+)/)?.[1];
    if (token) {
      await getDb().delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
    }
    const actorId = await getActorId(c);
    await logAudit("sign_out", actorId, "user", actorId ? String(actorId) : undefined);
    return c.json({ status: "ok" }, 200, {
      "Set-Cookie": `mt5.session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
  });

  app.openapi(sessionRoute, async (c) => {
    const token = c.req.header("cookie")?.match(/mt5\.session=([^;]+)/)?.[1];
    if (!token) return c.json({ user: null });

    const db = getDb();
    const session = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .get();
    if (!session || session.expiresAt < new Date()) {
      if (session) await db.delete(schema.sessions).where(eq(schema.sessions.id, token)).run();
      return c.json({ user: null });
    }

    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .get();
    if (!user) return c.json({ user: null });

    return c.json({ user: { id: user.id, email: user.email, name: user.name } });
  });
}
