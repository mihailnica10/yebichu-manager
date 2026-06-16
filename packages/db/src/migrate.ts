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
  `CREATE TABLE IF NOT EXISTS setup_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    completed INTEGER NOT NULL DEFAULT 0,
    management_instance_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS instance_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    source_instance TEXT,
    file_count INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS template_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES instance_templates(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL REFERENCES instances(name) ON DELETE CASCADE,
    auto_sync INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS config_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    set_type TEXT NOT NULL,
    source_instance TEXT,
    current_version INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS config_set_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_set_id INTEGER NOT NULL REFERENCES config_sets(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    file_count INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0,
    minio_path TEXT NOT NULL,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS config_set_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_set_id INTEGER NOT NULL REFERENCES config_sets(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL REFERENCES instances(name) ON DELETE CASCADE,
    auto_sync INTEGER DEFAULT 0,
    deployed_version INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS minio_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    endpoint TEXT NOT NULL DEFAULT 'minio:9000',
    access_key TEXT NOT NULL DEFAULT 'minioadmin',
    secret_key TEXT NOT NULL DEFAULT 'minioadmin',
    bucket TEXT NOT NULL DEFAULT 'mt5-configs',
    use_ssl INTEGER DEFAULT 0,
    region TEXT DEFAULT 'us-east-1',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
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
    try {
      await sqlite.execute("ALTER TABLE instances ADD COLUMN is_management INTEGER NOT NULL DEFAULT 0");
    } catch {}
  } finally {
    sqlite.close();
  }
}
