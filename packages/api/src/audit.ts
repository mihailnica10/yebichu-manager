import { eq, getDb, schema } from "@mt5/db";
import type { Context } from "hono";
import { emitSocketEvent } from "./socket";

export async function logAudit(
  action: string,
  actorId?: number,
  targetType?: string,
  targetId?: string,
  details?: object,
) {
  try {
    const db = getDb();
    const result = await db
      .insert(schema.auditLog)
      .values({
        action,
        actorId,
        targetType,
        targetId,
        detailsJson: details ? JSON.stringify(details) : null,
      })
      .returning()
      .get();
    if (result) {
      let actorName: string | null = null;
      let actorEmail: string | null = null;
      if (result.actorId) {
        const user = await db.select().from(schema.users).where(eq(schema.users.id, result.actorId)).get();
        if (user) {
          actorName = user.name;
          actorEmail = user.email;
        }
      }
      emitSocketEvent("audit:entry", {
        id: result.id,
        action: result.action,
        actorId: result.actorId,
        actorName,
        actorEmail,
        targetType: result.targetType,
        targetId: result.targetId,
        detailsJson: result.detailsJson,
        createdAt: result.createdAt,
      });
    }
  } catch {
    // audit logging is non-critical
  }
}

export async function getActorId(c: Context): Promise<number | undefined> {
  try {
    const token = c.req.header("cookie")?.match(/mt5\.session=([^;]+)/)?.[1];
    if (!token) return undefined;
    const db = getDb();
    const session = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .get();
    if (!session || session.expiresAt < new Date()) return undefined;
    return session.userId;
  } catch {
    return undefined;
  }
}
