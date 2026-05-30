import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JejakMode } from "../types.js";
import { GlobalMode } from "./GlobalMode.js";
import type { ModeStrategy } from "./ModeStrategy.js";
import { ProjectMode } from "./ProjectMode.js";

export function modeFor(mode: JejakMode): ModeStrategy {
  return mode === "global" ? new GlobalMode() : new ProjectMode();
}

/** True if the repo looks like a Node project (used to default the mode). */
export function hasPackageJson(repoRoot: string): boolean {
  return existsSync(join(repoRoot, "package.json"));
}

/** Default mode when no flag/prompt decides: project for Node repos, global otherwise. */
export function defaultMode(repoRoot: string): ModeStrategy {
  return hasPackageJson(repoRoot) ? new ProjectMode() : new GlobalMode();
}
