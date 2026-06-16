import { OpenAPIHono } from "@hono/zod-openapi";
import { syncSchema } from "@mt5/db";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./health";
import { startMetricsCollection } from "./metrics";
import { auditLogRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { installRoutes } from "./routes/install";
import { instanceRoutes } from "./routes/instances";
import { instanceTemplateRoutes } from "./routes/instance-templates";
import { marketRoutes } from "./routes/market";
import { mgmtFileRoutes } from "./routes/mgmt-files";
import { minioRoutes } from "./routes/minio";
import { profileFileRoutes } from "./routes/profile-files";
import { profileRoutes } from "./routes/profiles";
import { configSetRoutes } from "./routes/config-sets";
import { setupRoutes } from "./routes/setup";
import { systemRoutes } from "./routes/system";

syncSchema()
  .catch(console.error);

export function createApp() {
  const app = new OpenAPIHono();

  app.use("*", logger());
  app.use("*", cors());

  app.onError((err, c) => {
    console.error("[ERROR]", err.message, err.stack?.split("\n")[1]?.trim());
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  });

  healthRoutes(app);
  authRoutes(app);
  instanceRoutes(app);
  instanceTemplateRoutes(app);
  installRoutes(app);
  setupRoutes(app);
  systemRoutes(app);
  profileFileRoutes(app);
  profileRoutes(app);
  auditLogRoutes(app);
  configSetRoutes(app);
  minioRoutes(app);
  mgmtFileRoutes(app);
  marketRoutes(app);

  startMetricsCollection();

  app.doc("/doc", {
    openapi: "3.0.0",
    info: { version: "1.0.0", title: "MT5 Manager API" },
  });

  return app;
}
