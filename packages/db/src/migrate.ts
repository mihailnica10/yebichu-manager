import { createClient } from "@libsql/client";

const DB_PATH = process.env.DB_PATH || "/root/mt5/mt5.db";

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS instances (
    name TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'stopped',
    container_id TEXT,
    config_json TEXT DEFAULT '{}',
    resource_limits_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id),
    target_type TEXT,
    target_id TEXT,
    details_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS instance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_name TEXT NOT NULL REFERENCES instances(name) ON DELETE CASCADE,
    cpu_percent REAL DEFAULT 0,
    memory_usage_bytes INTEGER DEFAULT 0,
    memory_limit_bytes INTEGER DEFAULT 0,
    memory_percent REAL DEFAULT 0,
    network_rx_bytes INTEGER DEFAULT 0,
    network_tx_bytes INTEGER DEFAULT 0,
    block_read_bytes INTEGER DEFAULT 0,
    block_write_bytes INTEGER DEFAULT 0,
    pids_current INTEGER DEFAULT 0,
    recorded_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpu_percent REAL DEFAULT 0,
    memory_used_percent REAL DEFAULT 0,
    memory_total_bytes INTEGER DEFAULT 0,
    memory_available_bytes INTEGER DEFAULT 0,
    disk_used_percent REAL DEFAULT 0,
    disk_total_bytes INTEGER DEFAULT 0,
    disk_free_bytes INTEGER DEFAULT 0,
    load_1m REAL DEFAULT 0,
    load_5m REAL DEFAULT 0,
    load_15m REAL DEFAULT 0,
    recorded_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `DROP TABLE IF EXISTS accounts`,
  `CREATE INDEX IF NOT EXISTS idx_instance_metrics_lookup ON instance_metrics(instance_name, recorded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics(recorded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`,
];

export async function syncSchema() {
  const sqlite = createClient({ url: `file:${DB_PATH}` });
  try {
    for (const sql of tables) {
      await sqlite.execute(sql);
    }
  } finally {
    sqlite.close();
  }
}
