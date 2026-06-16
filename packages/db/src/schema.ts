import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const instances = sqliteTable("instances", {
  name: text("name").primaryKey(),
  status: text("status").notNull().default("stopped"),
  containerId: text("container_id"),
  configJson: text("config_json").default("{}"),
  resourceLimitsJson: text("resource_limits_json").default("{}"),
  isManagement: integer("is_management").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  metadataJson: text("metadata_json").default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  actorId: integer("actor_id").references(() => users.id),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detailsJson: text("details_json").default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const instanceMetrics = sqliteTable("instance_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceName: text("instance_name")
    .notNull()
    .references(() => instances.name, { onDelete: "cascade" }),
  cpuPercent: real("cpu_percent").default(0),
  memoryUsageBytes: integer("memory_usage_bytes").default(0),
  memoryLimitBytes: integer("memory_limit_bytes").default(0),
  memoryPercent: real("memory_percent").default(0),
  networkRxBytes: integer("network_rx_bytes").default(0),
  networkTxBytes: integer("network_tx_bytes").default(0),
  blockReadBytes: integer("block_read_bytes").default(0),
  blockWriteBytes: integer("block_write_bytes").default(0),
  pidsCurrent: integer("pids_current").default(0),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const systemMetrics = sqliteTable("system_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cpuPercent: real("cpu_percent").default(0),
  memoryUsedPercent: real("memory_used_percent").default(0),
  memoryTotalBytes: integer("memory_total_bytes").default(0),
  memoryAvailableBytes: integer("memory_available_bytes").default(0),
  diskUsedPercent: real("disk_used_percent").default(0),
  diskTotalBytes: integer("disk_total_bytes").default(0),
  diskFreeBytes: integer("disk_free_bytes").default(0),
  load1m: real("load_1m").default(0),
  load5m: real("load_5m").default(0),
  load15m: real("load_15m").default(0),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const setupState = sqliteTable("setup_state", {
  id: integer("id").primaryKey(),
  completed: integer("completed").notNull().default(0),
  managementInstanceName: text("management_instance_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const instanceTemplates = sqliteTable("instance_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  sourceInstance: text("source_instance"),
  fileCount: integer("file_count").default(0),
  totalSize: integer("total_size").default(0),
  metadataJson: text("metadata_json").default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const templateAssignments = sqliteTable("template_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id").notNull().references(() => instanceTemplates.id, { onDelete: "cascade" }),
  instanceName: text("instance_name").notNull().references(() => instances.name, { onDelete: "cascade" }),
  autoSync: integer("auto_sync").default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const configSets = sqliteTable("config_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  setType: text("set_type").notNull(),
  sourceInstance: text("source_instance"),
  currentVersion: integer("current_version").default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const configSetVersions = sqliteTable("config_set_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  configSetId: integer("config_set_id")
    .notNull()
    .references(() => configSets.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  fileCount: integer("file_count").default(0),
  totalSize: integer("total_size").default(0),
  minioPath: text("minio_path").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const configSetAssignments = sqliteTable("config_set_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  configSetId: integer("config_set_id")
    .notNull()
    .references(() => configSets.id, { onDelete: "cascade" }),
  instanceName: text("instance_name")
    .notNull()
    .references(() => instances.name, { onDelete: "cascade" }),
  autoSync: integer("auto_sync").default(0),
  deployedVersion: integer("deployed_version").default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

export const minioConfig = sqliteTable("minio_config", {
  id: integer("id").primaryKey(),
  endpoint: text("endpoint").notNull().default("minio:9000"),
  accessKey: text("access_key").notNull().default("minioadmin"),
  secretKey: text("secret_key").notNull().default("minioadmin"),
  bucket: text("bucket").notNull().default("mt5-configs"),
  useSsl: integer("use_ssl").default(0),
  region: text("region").default("us-east-1"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});
