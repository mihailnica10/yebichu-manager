import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const MT5_HOME = process.env.MT5_HOME || "/home/misu/mt5";

export const INSTANCES_DIR = process.env.INSTANCES_DIR || `${MT5_HOME}/instances`;
export const SHARED_DIR = process.env.SHARED_DIR || `${MT5_HOME}/shared`;
export const PROFILES_DIR = process.env.PROFILES_DIR || `${MT5_HOME}/profiles`;
export const RUNTIME_DIR = process.env.RUNTIME_DIR || "/home/misu/mt5-manager/runtime";
export const BRIDGE_SRC = process.env.BRIDGE_SRC || "/home/misu/mt5-manager/scripts/mt5-bridge";
export const DB_PATH = process.env.DB_PATH || `${MT5_HOME}/mt5.db`;
export const PROFILES_CHARTS_DIR = process.env.PROFILES_CHARTS_DIR || `${PROFILES_DIR}/Charts`;
export const PROFILES_TEMPLATES_DIR = process.env.PROFILES_TEMPLATES_DIR || `${PROFILES_DIR}/Templates`;
export const PROFILES_SYMBOLSETS_DIR = process.env.PROFILES_SYMBOLSETS_DIR || `${PROFILES_DIR}/SymbolSets`;

/** Create instance directories with world-writable permissions so both root (container) and host user have full access. */
export function ensureInstanceDir(instDir: string) {
  mkdirSync(instDir, { recursive: true });
  mkdirSync(`${instDir}/data`, { recursive: true });
  mkdirSync(`${instDir}/wine`, { recursive: true });
  execSync(`chmod -R 777 ${instDir}`, { stdio: "ignore" });
}

export function ensureSharedDir() {
  if (!existsSync(SHARED_DIR)) {
    mkdirSync(SHARED_DIR, { recursive: true });
    execSync(`chmod -R 777 ${SHARED_DIR}`, { stdio: "ignore" });
  }
}
