import { existsSync } from "node:fs";
import { join } from "node:path";

/** Per-repo opt-out: every hook exits 0 immediately if `.jejak/disabled` exists (DESIGN-LLD §9.1). */
export function isDisabled(repoRoot: string): boolean {
  return existsSync(join(repoRoot, ".jejak", "disabled"));
}
