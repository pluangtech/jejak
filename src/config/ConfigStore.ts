import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JejakConfig } from "../types.js";

const CONFIG_DIR = ".jejak";
const CONFIG_FILE = "config.json";

export function configPath(repoRoot: string): string {
  return join(repoRoot, CONFIG_DIR, CONFIG_FILE);
}

/** Read the committed config, or null if absent/unparseable. */
export function readConfig(repoRoot: string): JejakConfig | null {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as JejakConfig;
  } catch {
    return null;
  }
}

/** Write the committed config (machine-written; pretty-printed JSON). */
export function writeConfig(repoRoot: string, cfg: JejakConfig): void {
  mkdirSync(join(repoRoot, CONFIG_DIR), { recursive: true });
  writeFileSync(configPath(repoRoot), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}
