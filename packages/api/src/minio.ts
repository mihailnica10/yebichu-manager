import * as Minio from "minio";
import { eq, getDb, schema } from "@mt5/db";

let client: Minio.Client | null = null;

export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
  region: string;
}

export async function getMinioConfig(): Promise<MinioConfig | null> {
  try {
    const db = getDb();
    const row = await db
      .select()
      .from(schema.minioConfig)
      .where(eq(schema.minioConfig.id, 1))
      .get();
    if (!row) return null;
    return {
      endpoint: row.endpoint,
      accessKey: row.accessKey,
      secretKey: row.secretKey,
      bucket: row.bucket,
      useSsl: row.useSsl === 1,
      region: row.region || "us-east-1",
    };
  } catch {
    return null;
  }
}

export async function saveMinioConfig(config: MinioConfig): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.minioConfig)
    .values({
      id: 1,
      endpoint: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      bucket: config.bucket,
      useSsl: config.useSsl ? 1 : 0,
      region: config.region,
    })
    .onConflictDoUpdate({
      target: schema.minioConfig.id,
      set: {
        endpoint: config.endpoint,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
        bucket: config.bucket,
        useSsl: config.useSsl ? 1 : 0,
        region: config.region,
      },
    })
    .run();
  client = null;
}

export function getMinioClient(config: MinioConfig): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: config.endpoint.replace(/:\d+$/, ""),
      port: Number.parseInt(config.endpoint.split(":").pop() || "9000"),
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSsl,
      region: config.region || "us-east-1",
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  const config = await getMinioConfig();
  if (!config) throw new Error("MinIO not configured");
  const mc = getMinioClient(config);
  const exists = await mc.bucketExists(config.bucket);
  if (!exists) {
    await mc.makeBucket(config.bucket, config.region || "us-east-1");
  }
}

export async function uploadConfigSet(
  setId: number,
  version: number,
  tarGzBuffer: Buffer,
): Promise<void> {
  const config = await getMinioConfig();
  if (!config) throw new Error("MinIO not configured");
  const mc = getMinioClient(config);
  const key = `config-sets/${setId}/v${version}.tar.gz`;
  await mc.putObject(config.bucket, key, tarGzBuffer, tarGzBuffer.length, {
    "Content-Type": "application/gzip",
  });
}

export async function downloadConfigSet(
  setId: number,
  version: number,
): Promise<Buffer> {
  const config = await getMinioConfig();
  if (!config) throw new Error("MinIO not configured");
  const mc = getMinioClient(config);
  const key = `config-sets/${setId}/v${version}.tar.gz`;
  const stream = await mc.getObject(config.bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteConfigSet(setId: number): Promise<void> {
  const config = await getMinioConfig();
  if (!config) throw new Error("MinIO not configured");
  const mc = getMinioClient(config);
  const basePath = `config-sets/${setId}`;
  const stream = mc.listObjects(config.bucket, basePath, true);
  const objectsToDelete: string[] = [];
  for await (const obj of stream) {
    if (obj.name) objectsToDelete.push(obj.name);
  }
  if (objectsToDelete.length > 0) {
    await mc.removeObjects(config.bucket, objectsToDelete);
  }
}
