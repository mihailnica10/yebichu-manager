import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, getDb, schema } from "@mt5/db";
import { getActorId, logAudit } from "../audit";
import { emitSocketEvent } from "../socket";
import {
  uploadConfigSet,
  downloadConfigSet,
  deleteConfigSet as minioDeleteSet,
  ensureBucket,
} from "../minio";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { setTimeout } from "node:timers/promises";
import { SHARED_DIR, INSTANCES_DIR } from "../shared/paths";

function emitProgress(opts: {
  operation: "capture" | "load" | "deploy";
  configSetId: number;
  status: "running" | "completed" | "error";
  stage: string;
  message: string;
  progress_pct: number;
}) {
  emitSocketEvent("snapshot:progress", opts);
}

// Schema definitions
const ConfigSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  setType: z.string(),
  sourceInstance: z.string().nullable(),
  currentVersion: z.number(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const CreateConfigSetBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  setType: z.enum([
    "charts", "templates", "symbolsets",
    "mql5-experts", "mql5-indicators", "mql5-include",
    "mql5-scripts", "mql5-libraries", "full",
  ]),
});

const UpdateConfigSetBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const AssignBody = z.object({
  instanceNames: z.array(z.string()),
  autoSync: z.boolean().optional().default(false),
});

const DeployBody = z.object({
  instanceNames: z.array(z.string()).optional(),
  version: z.number().optional(),
});

// ---- Route definitions ----

const listRoute = createRoute({
  method: "get",
  path: "/config-sets",
  responses: {
    200: { content: { "application/json": { schema: z.object({ configSets: z.array(ConfigSetSchema) }) } }, description: "List config sets" },
    401: { description: "Unauthorized" },
  },
});

const createRoute_fn = createRoute({
  method: "post",
  path: "/config-sets",
  request: { body: { content: { "application/json": { schema: CreateConfigSetBody } } } },
  responses: {
    201: { content: { "application/json": { schema: ConfigSetSchema } }, description: "Created" },
    401: { description: "Unauthorized" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/config-sets/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: ConfigSetSchema } }, description: "Config set details" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const updateRoute = createRoute({
  method: "put",
  path: "/config-sets/{id}",
  request: { params: z.object({ id: z.coerce.number() }), body: { content: { "application/json": { schema: UpdateConfigSetBody } } } },
  responses: {
    200: { content: { "application/json": { schema: ConfigSetSchema } }, description: "Updated" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/config-sets/{id}",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string() }) } }, description: "Deleted" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const captureRoute = createRoute({
  method: "post",
  path: "/config-sets/{id}/capture",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string(), version: z.number(), fileCount: z.number() }) } }, description: "Captured" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const deployRoute = createRoute({
  method: "post",
  path: "/config-sets/{id}/deploy",
  request: { params: z.object({ id: z.coerce.number() }), body: { content: { "application/json": { schema: DeployBody } } } },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string(), instances: z.array(z.any()) }) } }, description: "Deployed" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const loadRoute = createRoute({
  method: "post",
  path: "/config-sets/{id}/load",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string() }) } }, description: "Loaded into management" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const assignRoute = createRoute({
  method: "post",
  path: "/config-sets/{id}/assign",
  request: { params: z.object({ id: z.coerce.number() }), body: { content: { "application/json": { schema: AssignBody } } } },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string(), count: z.number() }) } }, description: "Assigned" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

const unassignRoute = createRoute({
  method: "delete",
  path: "/config-sets/{id}/assign/{instanceName}",
  request: { params: z.object({ id: z.coerce.number(), instanceName: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ status: z.string() }) } }, description: "Unassigned" },
    401: { description: "Unauthorized" },
  },
});

const versionsRoute = createRoute({
  method: "get",
  path: "/config-sets/{id}/versions",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ versions: z.array(z.any()) }) } }, description: "Versions list" },
    401: { description: "Unauthorized" },
  },
});

const filesRoute = createRoute({
  method: "get",
  path: "/config-sets/{id}/files",
  request: { params: z.object({ id: z.coerce.number() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ files: z.array(z.any()) }) } }, description: "Files list" },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

// ---- Helpers ----

function walkDir(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relative(baseDir, fullPath));
    }
  }
  return results;
}

// ---- Route registration ----

export function configSetRoutes(app: OpenAPIHono) {
  const db = () => getDb();

  // LIST
  app.openapi(listRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const all = await db().select().from(schema.configSets).all();
    return c.json({ configSets: all });
  });

  // CREATE
  app.openapi(createRoute_fn, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { name, description, setType } = c.req.valid("json");
    const result = await db()
      .insert(schema.configSets)
      .values({ name, description: description || null, setType })
      .returning()
      .get();
    await logAudit("config_set_create", actorId, "config_set", String(result.id), { name, setType });
    emitSocketEvent("config-set:created", { id: result.id, name: result.name, setType: result.setType });
    return c.json(result, 201);
  });

  // GET
  app.openapi(getRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const cs = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!cs) return c.json({ error: "not found" }, 404);
    return c.json(cs);
  });

  // UPDATE
  app.openapi(updateRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const { name, description } = c.req.valid("json");
    const existing = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!existing) return c.json({ error: "not found" }, 404);
    const result = await db()
      .update(schema.configSets)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(eq(schema.configSets.id, id))
      .returning()
      .get();
    await logAudit("config_set_update", actorId, "config_set", String(id), { name });
    emitSocketEvent("config-set:updated", { id, name: body.name || existing.name });
    return c.json(result);
  });

  // DELETE
  app.openapi(deleteRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const existing = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!existing) return c.json({ error: "not found" }, 404);
    await minioDeleteSet(id);
    await db().delete(schema.configSets).where(eq(schema.configSets.id, id)).run();
    await logAudit("config_set_delete", actorId, "config_set", String(id), {});
    emitSocketEvent("config-set:deleted", { id });
    return c.json({ status: "deleted" });
  });

  // CAPTURE
  app.openapi(captureRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const cs = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!cs) return c.json({ error: "not found" }, 404);

    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "running",
      stage: "analyzing_mt5_directory",
      message: "Analyzing MT5 directory structure",
      progress_pct: 5,
    });

    // 1. Close terminal so files are flushed to disk
    try {
      execSync("docker exec mt5-mgmt pkill -f terminal64.exe 2>/dev/null || true", { timeout: 5000 });
    } catch {}
    await setTimeout(2000);

    // 2. Capture tar.gz from management container
    let tarBuffer: Buffer;
    try {
      tarBuffer = execSync(
        `docker exec mt5-mgmt sh -c 'cd "/config/.wine/drive_c/Program Files/MetaTrader 5" && python3 /mt5-bridge/capture_template.py'`,
        { encoding: "buffer", timeout: 60000, maxBuffer: 100 * 1024 * 1024 },
      );
    } catch (err: any) {
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Capture failed: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Capture failed: ${err.message}` }, 500);
    }

    const newVersion = (cs.currentVersion ?? 0) + 1;
    const tmpDir = `/tmp/capture-${id}-${newVersion}`;

    // 2. Extract tar.gz to list and filter files
    let fileEntries: { path: string; size: number }[] = [];
    try {
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "running",
        stage: "scanning_files",
        message: "Scanning files from archive",
        progress_pct: 15,
      });

      const listOutput = execSync("tar tzf -", { input: tarBuffer, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      const allFiles = listOutput.trim().split("\n").filter(Boolean).map((p) => ({ path: p, size: 0 }));

      if (cs.setType !== "full") {
        const typePrefixes: Record<string, string> = {
          charts: "Profiles/Charts/",
          templates: "Profiles/Templates/",
          symbolsets: "Profiles/SymbolSets/",
          "mql5-experts": "MQL5/Experts/",
          "mql5-indicators": "MQL5/Indicators/",
          "mql5-include": "MQL5/Include/",
          "mql5-scripts": "MQL5/Scripts/",
          "mql5-libraries": "MQL5/Libraries/",
        };
        const prefix = typePrefixes[cs.setType];
        fileEntries = prefix ? allFiles.filter((f) => f.path.startsWith(prefix)) : allFiles;
      } else {
        fileEntries = allFiles;
      }
    } catch (err: any) {
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Failed to list tar: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Failed to list tar: ${err.message}` }, 500);
    }

    if (fileEntries.length === 0) {
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "error",
        stage: "error",
        message: "No files match this set type",
        progress_pct: 0,
      });
      return c.json({ error: "No files match this set type" }, 400);
    }

    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "running",
      stage: "excluding_auth_data",
      message: "Excluding auth data from snapshot",
      progress_pct: 25,
    });

    // 3. Extract filtered files to temp dir
    try {
      mkdirSync(tmpDir, { recursive: true });
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "running",
        stage: "archiving_files",
        message: `Archiving ${fileEntries.length} files`,
        progress_pct: 40,
      });
      if (cs.setType !== "full") {
        const patterns = fileEntries.map((f) => f.path);
        execSync(`tar xzf - -C ${tmpDir} ${patterns.map((p) => `"${p}"`).join(" ")}`, {
          input: tarBuffer,
          maxBuffer: 100 * 1024 * 1024,
        });
      } else {
        execSync(`tar xzf - -C ${tmpDir}`, { input: tarBuffer, maxBuffer: 100 * 1024 * 1024 });
      }
    } catch (err: any) {
      rmSync(tmpDir, { recursive: true, force: true });
      emitProgress({
        operation: "capture",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Extraction failed: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Extraction failed: ${err.message}` }, 500);
    }

    // 4. Create filtered tar.gz if needed
    let finalBuffer = tarBuffer;
    if (cs.setType !== "full") {
      try {
        emitProgress({
          operation: "capture",
          configSetId: id,
          status: "running",
          stage: "compressing_snapshot",
          message: "Compressing snapshot archive",
          progress_pct: 55,
        });
        finalBuffer = execSync("tar czf - -C " + tmpDir + " .", {
          maxBuffer: 100 * 1024 * 1024,
        });
      } catch (err: any) {
        rmSync(tmpDir, { recursive: true, force: true });
        emitProgress({
          operation: "capture",
          configSetId: id,
          status: "error",
          stage: "error",
          message: `Re-packing failed: ${err.message}`,
          progress_pct: 0,
        });
        return c.json({ error: `Re-packing failed: ${err.message}` }, 500);
      }
    }

    // 5. Upload tar.gz to MinIO
    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "running",
      stage: "uploading_to_storage",
      message: "Uploading snapshot to storage",
      progress_pct: 70,
    });
    await ensureBucket();
    await uploadConfigSet(id, newVersion, finalBuffer);

    // 6. Clean up temp directory
    rmSync(tmpDir, { recursive: true, force: true });

    // 7. Create version record in DB
    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "running",
      stage: "finalizing",
      message: `Finalizing snapshot v${newVersion}`,
      progress_pct: 90,
    });
    const totalSize = finalBuffer.length;
    const minioPath = `config-sets/${id}/v${newVersion}.tar.gz`;
    await db()
      .insert(schema.configSetVersions)
      .values({
        configSetId: id,
        version: newVersion,
        fileCount: fileEntries.length,
        totalSize,
        minioPath,
        createdBy: actorId,
      })
      .run();

    emitSocketEvent("config-set:version-created", { configSetId: id, version: newVersion });

    // 8. Update current version on the config set
    await db()
      .update(schema.configSets)
      .set({ currentVersion: newVersion, updatedAt: new Date(), sourceInstance: "mt5-mgmt" })
      .where(eq(schema.configSets.id, id))
      .run();

    await logAudit("config_set_capture", actorId, "config_set", String(id), {
      version: newVersion,
      files: fileEntries.length,
    });

    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "running",
      stage: "restarting_terminal",
      message: "Restarting MetaTrader terminal",
      progress_pct: 95,
    });

    // 9. Restart terminal
    try {
      execSync(
        `docker exec mt5-mgmt sh -c "cd '/config/.wine/drive_c/Program Files/MetaTrader 5' && wine terminal64.exe /portable /withdrawal:disabled &"`,
        { timeout: 10000 }
      );
    } catch {}
    let restarted = false;
    for (let i = 0; i < 10; i++) {
      try {
        const check = execSync("docker exec mt5-mgmt pgrep -f terminal64.exe 2>/dev/null || true", { encoding: "utf-8", timeout: 3000 });
        if (check.trim()) { restarted = true; break; }
      } catch {}
      await setTimeout(1000);
    }
    if (!restarted) console.warn("[capture] Terminal did not restart within 10s");

    emitProgress({
      operation: "capture",
      configSetId: id,
      status: "completed",
      stage: "completed",
      message: `Capture complete — v${newVersion} (${fileEntries.length} files)`,
      progress_pct: 100,
    });

    return c.json({ status: "captured", version: newVersion, fileCount: fileEntries.length });
  });

  // DEPLOY
  app.openapi(deployRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const cs = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!cs) return c.json({ error: "not found" }, 404);

    const version = body.version ?? cs.currentVersion ?? 0;
    if (version === 0) return c.json({ error: "No versions captured yet" }, 400);

    let instanceNames = body.instanceNames;
    if (!instanceNames || instanceNames.length === 0) {
      const assignments = await db()
        .select()
        .from(schema.configSetAssignments)
        .where(eq(schema.configSetAssignments.configSetId, id))
        .all();
      instanceNames = assignments.map((a) => a.instanceName);
    }

    emitProgress({
      operation: "deploy",
      configSetId: id,
      status: "running",
      stage: "resolving_targets",
      message: `Resolving ${instanceNames.length} target instance(s)`,
      progress_pct: 5,
    });

    // Download tar.gz from MinIO
    emitProgress({
      operation: "deploy",
      configSetId: id,
      status: "running",
      stage: "downloading_snapshot",
      message: "Downloading snapshot from storage",
      progress_pct: 15,
    });

    let tarGzBuffer: Buffer;
    try {
      tarGzBuffer = await downloadConfigSet(id, version);
    } catch (err: any) {
      emitProgress({
        operation: "deploy",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Download from MinIO failed: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Download from MinIO failed: ${err.message}` }, 500);
    }

    emitProgress({
      operation: "deploy",
      configSetId: id,
      status: "running",
      stage: "preparing_deployment",
      message: "Preparing deployment package",
      progress_pct: 25,
    });

    // Detect profile from tar for common.ini update
    let profileFromTar: string | undefined;
    try {
      const profileList = execSync("tar tzf -", { input: tarGzBuffer, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      const profiles = profileList.split("\n").filter(l => l.startsWith("Profiles/")).map(l => l.split("/")[2]);
      const uniqueProfiles = [...new Set(profiles)].filter(Boolean);
      if (uniqueProfiles.length > 0) {
        profileFromTar = uniqueProfiles[0];
      }
    } catch {}

    // Deploy to each instance: pipe tar.gz directly into container
    const results: { name: string; status: string }[] = [];
    for (const [i, instanceName] of instanceNames.entries()) {
      try {
        emitProgress({
          operation: "deploy",
          configSetId: id,
          status: "running",
          stage: "piping_to_instance",
          message: `Deploying to ${instanceName} (${i + 1}/${instanceNames.length})`,
          progress_pct: 50,
        });

        // Kill terminal BEFORE modifying files
        execSync(`docker exec ${instanceName} pkill -f terminal64.exe 2>/dev/null || true`, {
          timeout: 5000,
        });
        await setTimeout(1000);

        // Pipe tar.gz into container
        execSync(
          `docker exec -i ${instanceName} tar xzf - -C "/config/.wine/drive_c/Program Files/MetaTrader 5"`,
          { input: tarGzBuffer, timeout: 60000, maxBuffer: 100 * 1024 * 1024 },
        );

        emitProgress({
          operation: "deploy",
          configSetId: id,
          status: "running",
          stage: "updating_config",
          message: "Updating terminal configuration",
          progress_pct: 65,
        });

        // Update common.ini for profile
        if (profileFromTar) {
          try {
            execSync(
              `docker exec -e PROFILE="${profileFromTar}" ${instanceName} python3 -c 'import os,sys
p=os.environ["PROFILE"]
path="/config/.wine/drive_c/Program Files/MetaTrader 5/config/common.ini"
if not os.path.exists(path):
    sys.exit(0)
with open(path,"rb") as f: raw=f.read()
is16=raw[:2]==b"\\xff\\xfe"
txt=raw.decode("utf-16-le" if is16 else "utf-8")
lines=txt.split("\\n")
sec=""; out=[]; seen={}
for l in lines:
    s=l.strip()
    if s.startswith("[") and s.endswith("]"): sec=s
    if sec=="[Charts]" and s.startswith("ProfileLast="):
        out.append(f"ProfileLast={p}"); seen["charts"]=1; continue
    if sec=="[Experts]":
        for k in ["AllowDllImport","Enabled","Account","Profile","WebRequest"]:
            if s.startswith(k+"="):
                out.append(f"{k}=1"); seen[k]=1; break
        else:
            out.append(l)
        continue
    out.append(l)
if not seen.get("charts"): out.insert(out.index("[Charts]")+1,f"ProfileLast={p}")
if "[Experts]" in out:
    ei=out.index("[Experts]")
    for k in ["AllowDllImport","Enabled","Account","Profile","WebRequest"]:
        if not seen.get(k): out.insert(ei+1,f"{k}=1")
txt="\\n".join(out)
enc="utf-16-le" if is16 else "utf-8"
with open(path,"wb") as f: f.write(txt.encode(enc))
sys.stderr.write(f"common.ini updated: ProfileLast={p}\\n")
'`,
              { timeout: 15000 },
            );
          } catch (err: any) {
            console.error(`[deploy] Failed to update common.ini for ${instanceName}: ${err.message}`);
          }
        }

        emitProgress({
          operation: "deploy",
          configSetId: id,
          status: "running",
          stage: "restarting_terminal",
          message: `Restarting terminal on ${instanceName}`,
          progress_pct: 80,
        });

        // Immediately restart terminal
        try {
          execSync(
            `docker exec ${instanceName} sh -c "cd '/config/.wine/drive_c/Program Files/MetaTrader 5' && wine terminal64.exe /portable /withdrawal:disabled &"`,
            { timeout: 10000 }
          );
        } catch {}

        // Wait for terminal to actually start (poll pgrep, up to 10s)
        let restarted = false;
        for (let j = 0; j < 10; j++) {
          try {
            const check = execSync(`docker exec ${instanceName} pgrep -f terminal64.exe 2>/dev/null || true`, { encoding: "utf-8", timeout: 3000 });
            if (check.trim()) {
              restarted = true;
              await setTimeout(3000);
              break;
            }
          } catch {}
          await setTimeout(1000);
        }
        results.push({ name: instanceName, status: restarted ? "restarted" : "restarting" });

        // Update deployedVersion only on success
        await db()
          .update(schema.configSetAssignments)
          .set({ deployedVersion: version })
          .where(
            and(
              eq(schema.configSetAssignments.configSetId, id),
              eq(schema.configSetAssignments.instanceName, instanceName),
            ),
          )
          .run();
      } catch (err: any) {
        results.push({ name: instanceName, status: `error: ${err.message}` });
      }
    }

    emitProgress({
      operation: "deploy",
      configSetId: id,
      status: "running",
      stage: "finalizing",
      message: "Finalizing deployment",
      progress_pct: 90,
    });

    await logAudit("config_set_deploy", actorId, "config_set", String(id), {
      version,
      instances: instanceNames,
    });

    const successCount = results.filter(r => !r.status.startsWith("error")).length;
    emitProgress({
      operation: "deploy",
      configSetId: id,
      status: "completed",
      stage: "completed",
      message: `Deployed to ${successCount}/${instanceNames.length} instance(s) successfully`,
      progress_pct: 100,
    });

    return c.json({ status: "deployed", instances: results });
  });

  // LOAD INTO MANAGEMENT
  app.openapi(loadRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");

    const cs = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!cs) return c.json({ error: "not found" }, 404);
    if (cs.currentVersion === 0) return c.json({ error: "No versions captured yet" }, 400);

    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "downloading_snapshot",
      message: "Downloading snapshot from storage",
      progress_pct: 5,
    });

    // Download tar.gz from MinIO
    let tarGzBuffer: Buffer;
    try {
      tarGzBuffer = await downloadConfigSet(id, cs.currentVersion!);
    } catch (err: any) {
      emitProgress({
        operation: "load",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Download from MinIO failed: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Download from MinIO failed: ${err.message}` }, 500);
    }

    // Detect profile name and count files from tar.gz listing
    let restoredProfile: string | undefined;
    let fileCount = 0;
    try {
      const profileList = execSync("tar tzf -", { input: tarGzBuffer, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      const lines = profileList.trim().split("\n").filter(Boolean);
      fileCount = lines.length;

      emitProgress({
        operation: "load",
        configSetId: id,
        status: "running",
        stage: "extracting_archive",
        message: `Extracting archive (${fileCount} files)`,
        progress_pct: 15,
      });

      const profiles = lines.filter(l => l.startsWith("Profiles/")).map(l => l.split("/")[2]);
      const uniqueProfiles = [...new Set(profiles)].filter(Boolean);
      if (uniqueProfiles.length > 0) {
        restoredProfile = uniqueProfiles[0];
      }

      emitProgress({
        operation: "load",
        configSetId: id,
        status: "running",
        stage: "identifying_profile",
        message: "Identifying active profile",
        progress_pct: 25,
      });
    } catch (err: any) {
      console.warn(`[load] Could not detect profile from tar: ${err.message}`);
    }

    // Kill terminal BEFORE modifying files
    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "piping_to_container",
      message: "Piping files into management container",
      progress_pct: 40,
    });
    try {
      execSync("docker exec mt5-mgmt pkill -f terminal64.exe 2>/dev/null || true", { timeout: 5000 });
    } catch {}
    await setTimeout(1000);

    // Pipe tar.gz directly into container (no local extraction)
    try {
      execSync(
        `docker exec -i mt5-mgmt tar xzf - -C "/config/.wine/drive_c/Program Files/MetaTrader 5"`,
        { input: tarGzBuffer, timeout: 60000, maxBuffer: 100 * 1024 * 1024 },
      );
    } catch (err: any) {
      emitProgress({
        operation: "load",
        configSetId: id,
        status: "error",
        stage: "error",
        message: `Extract in mgmt container failed: ${err.message}`,
        progress_pct: 0,
      });
      return c.json({ error: `Extract in mgmt container failed: ${err.message}` }, 500);
    }

    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "restoring_structure",
      message: "Restoring directory structure",
      progress_pct: 50,
    });

    // Update common.ini for profile and EA compatibility
    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "updating_config",
      message: "Updating common.ini configuration",
      progress_pct: 60,
    });
    if (restoredProfile) {
      try {
        execSync(
          `docker exec -e PROFILE="${restoredProfile}" mt5-mgmt python3 -c 'import os,sys
p=os.environ["PROFILE"]
path="/config/.wine/drive_c/Program Files/MetaTrader 5/config/common.ini"
if not os.path.exists(path):
    sys.exit(0)
with open(path,"rb") as f: raw=f.read()
is16=raw[:2]==b"\\xff\\xfe"
txt=raw.decode("utf-16-le" if is16 else "utf-8")
lines=txt.split("\\n")
sec=""; out=[]; seen={}
for l in lines:
    s=l.strip()
    if s.startswith("[") and s.endswith("]"): sec=s
    if sec=="[Charts]" and s.startswith("ProfileLast="):
        out.append(f"ProfileLast={p}"); seen["charts"]=1; continue
    if sec=="[Experts]":
        for k in ["AllowDllImport","Enabled","Account","Profile","WebRequest"]:
            if s.startswith(k+"="):
                out.append(f"{k}=1"); seen[k]=1; break
        else:
            out.append(l)
        continue
    out.append(l)
if not seen.get("charts"): out.insert(out.index("[Charts]")+1,f"ProfileLast={p}")
if "[Experts]" in out:
    ei=out.index("[Experts]")
    for k in ["AllowDllImport","Enabled","Account","Profile","WebRequest"]:
        if not seen.get(k): out.insert(ei+1,f"{k}=1")
txt="\\n".join(out)
enc="utf-16-le" if is16 else "utf-8"
with open(path,"wb") as f: f.write(txt.encode(enc))
sys.stderr.write(f"common.ini updated: ProfileLast={p}\\n")
'`,
          { timeout: 15000 },
        );
      } catch (err: any) {
        console.error(`[load] Failed to update common.ini: ${err.message}`);
      }
    }

    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "syncing_directories",
      message: "Syncing shared directories",
      progress_pct: 80,
    });

    emitProgress({
      operation: "load",
      configSetId: id,
      status: "running",
      stage: "restarting_terminal",
      message: "Restarting MetaTrader terminal",
      progress_pct: 90,
    });

    // Immediately restart terminal (already killed earlier)
    try {
      execSync(
        `docker exec mt5-mgmt sh -c "cd '/config/.wine/drive_c/Program Files/MetaTrader 5' && wine terminal64.exe /portable /withdrawal:disabled &"`,
        { timeout: 10000 }
      );
    } catch {}

    // Wait for terminal to actually start (poll pgrep, up to 10s)
    let restarted = false;
    for (let i = 0; i < 10; i++) {
      try {
        const check = execSync("docker exec mt5-mgmt pgrep -f terminal64.exe 2>/dev/null || true", { encoding: "utf-8", timeout: 3000 });
        if (check.trim()) {
          restarted = true;
          await setTimeout(3000);
          break;
        }
      } catch {}
      await setTimeout(1000);
    }
    if (!restarted) console.warn("[load] Terminal did not restart within 10s");

    await logAudit("config_set_load", actorId, "config_set", String(id), {
      version: cs.currentVersion,
      ...(restoredProfile && { restoredProfile }),
    });

    emitProgress({
      operation: "load",
      configSetId: id,
      status: "completed",
      stage: "completed",
      message: `Load complete — Profile: ${restoredProfile || "unknown"}`,
      progress_pct: 100,
    });

    return c.json({ status: "loaded", version: cs.currentVersion });
  });

  // ASSIGN
  app.openapi(assignRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const { instanceNames, autoSync } = c.req.valid("json");

    let count = 0;
    for (const instanceName of instanceNames) {
      try {
        await db()
          .insert(schema.configSetAssignments)
          .values({
            configSetId: id,
            instanceName,
            autoSync: autoSync ? 1 : 0,
          })
          .onConflictDoNothing()
          .run();
        count++;
      } catch {
        // Skip duplicates
      }
    }

    await logAudit("config_set_assign", actorId, "config_set", String(id), { instances: instanceNames });
    return c.json({ status: "assigned", count });
  });

  // UNASSIGN
  app.openapi(unassignRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id, instanceName } = c.req.valid("param");
    await db()
      .delete(schema.configSetAssignments)
      .where(
        and(
          eq(schema.configSetAssignments.configSetId, id),
          eq(schema.configSetAssignments.instanceName, instanceName),
        ),
      )
      .run();
    await logAudit("config_set_unassign", actorId, "config_set", String(id), { instance: instanceName });
    return c.json({ status: "unassigned" });
  });

  // VERSIONS
  app.openapi(versionsRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const versions = await db()
      .select()
      .from(schema.configSetVersions)
      .where(eq(schema.configSetVersions.configSetId, id))
      .orderBy(schema.configSetVersions.version)
      .all();
    return c.json({ versions });
  });

  // FILES (list files in current version)
  app.openapi(filesRoute, async (c) => {
    const actorId = await getActorId(c);
    if (!actorId) return c.json({ error: "unauthorized" }, 401);
    const { id } = c.req.valid("param");
    const cs = await db().select().from(schema.configSets).where(eq(schema.configSets.id, id)).get();
    if (!cs) return c.json({ error: "not found" }, 404);
    if (cs.currentVersion === 0) return c.json({ files: [] });

    // Download tar.gz from MinIO
    let tarGzBuffer: Buffer;
    try {
      tarGzBuffer = await downloadConfigSet(id, cs.currentVersion!);
    } catch {
      return c.json({ files: [] });
    }

    // List tar entries with sizes using verbose mode
    let listing: string;
    try {
      listing = execSync("tar -tzvf -", {
        input: tarGzBuffer,
        encoding: "utf-8",
        maxBuffer: 100 * 1024 * 1024,
      });
    } catch {
      return c.json({ files: [] });
    }

    // Parse tar verbose output: "-rw-r--r-- 0/0           12345 2024-01-01 00:00 path/to/file"
    const files: { path: string; size: number }[] = [];
    for (const line of listing.trim().split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.endsWith("/")) continue;
      const match = trimmed.match(/^[drwxlst-]{10}\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/);
      if (match) {
        files.push({ path: match[2], size: parseInt(match[1], 10) });
      }
    }

    return c.json({ files });
  });
}
