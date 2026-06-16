import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "/root/mt5/mt5.db";

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!dbInstance) {
    const sqlite = createClient({ url: `file:${DB_PATH}` });
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

export { schema };
export type DbClient = ReturnType<typeof drizzle>;
