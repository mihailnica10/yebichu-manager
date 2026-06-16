import { eq, getDb, schema } from "./index";
import { hashPassword } from "./password";

export async function seedAdmin() {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, "admin@mt5.local"))
    .get();
  if (existing) return;

  const passwordHash = hashPassword("admin123");
  await db
    .insert(schema.users)
    .values({
      email: "admin@mt5.local",
      name: "Admin",
      passwordHash,
    })
    .run();
}
