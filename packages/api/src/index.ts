import { OpenAPIHono } from "@hono/zod-openapi";
import { seedAdmin, syncSchema } from "@mt5/db";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRoutes } from "./health";
import { startMetricsCollection } from "./metrics";
import { auditLogRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { installRoutes } from "./routes/install";
import { instanceRoutes } from "./routes/instances";
import { marketRoutes } from "./routes/market";
import { profileFileRoutes } from "./routes/profile-files";
import { profileRoutes } from "./routes/profiles";
import { systemRoutes } from "./routes/system";

syncSchema()
  .then(() => seedAdmin())
  .catch(console.error);

export function createApp() {
  const app = new OpenAPIHono();

  app.use("*", logger());
  app.use("*", cors());

  healthRoutes(app);
  authRoutes(app);
  instanceRoutes(app);
  installRoutes(app);
  systemRoutes(app);
  profileFileRoutes(app);
  profileRoutes(app);
  auditLogRoutes(app);
  marketRoutes(app);

  startMetricsCollection();

  app.doc("/doc", {
    openapi: "3.0.0",
    info: { version: "1.0.0", title: "MT5 Manager API" },
  });

  return app;
}
