import { execSync } from "node:child_process";
import { eq, getDb, schema } from "@mt5/db";

export function getContainerId(name: string): string {
  try {
    return execSync(`docker inspect --format '{{.Id}}' ${name}`, { encoding: "utf-8" }).trim();
  } catch {
    return name;
  }
}

export async function detectPorts(name: string) {
  try {
    const db = getDb();
    const inst = await db
      .select()
      .from(schema.instances)
      .where(eq(schema.instances.name, name))
      .get();
    if (!inst) return null;

    let config: Record<string, any> = {};
    try {
      config = JSON.parse(inst.configJson || "{}");
    } catch {}

    try {
      const vncPortInfo = execSync(`docker port ${name} 5901/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const vncPort = Number.parseInt(vncPortInfo.trim());
      if (!Number.isNaN(vncPort)) config.vncPort = vncPort;
    } catch {}

    try {
      const wsPortInfo = execSync(`docker port ${name} 6080/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const wsPort = Number.parseInt(wsPortInfo.trim());
      if (!Number.isNaN(wsPort)) config.wsPort = wsPort;
    } catch {}

    try {
      const bridgePortInfo = execSync(`docker port ${name} 8090/tcp | head -1 | sed 's/.*://'`, {
        encoding: "utf-8",
      });
      const bridgePort = Number.parseInt(bridgePortInfo.trim());
      if (!Number.isNaN(bridgePort)) config.bridgePort = bridgePort;
    } catch {}

    await db
      .update(schema.instances)
      .set({ configJson: JSON.stringify(config), updatedAt: new Date() })
      .where(eq(schema.instances.name, name))
      .run();

    return config;
  } catch {
    return null;
  }
}
