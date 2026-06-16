import { execSync } from "node:child_process";

const IMAGE_TAG = "mt5-tigervnc:latest";
const RUNTIME_DIR = process.env.RUNTIME_DIR || "/home/misu/mt5-manager/runtime";

export function checkDockerAvailable(): boolean {
  try {
    execSync("docker --version", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

export function checkImageExists(): boolean {
  try {
    execSync(`docker image inspect ${IMAGE_TAG} --format exists`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

export function getDockerVersion(): string {
  try {
    const out = execSync("docker --version", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
    return out
      .trim()
      .replace(/^Docker version /i, "")
      .replace(/,.*$/, "");
  } catch {
    return "unknown";
  }
}

export function buildImage(): { success: boolean; output: string } {
  try {
    const out = execSync(`docker build -t ${IMAGE_TAG} ${RUNTIME_DIR}`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 10,
      timeout: 1800000,
    });
    return { success: true, output: out };
  } catch (err: any) {
    return { success: false, output: String(err) };
  }
}

export function ensureImage(): string | null {
  if (checkImageExists()) return null;
  const result = buildImage();
  if (result.success) return null;
  return result.output;
}
