import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Add jejak to the repo's devDependencies if a package.json exists and it isn't already there.
 * Idempotent; tolerant of a missing/odd package.json (returns added:false).
 */
export function ensureJejakDevDependency(repoRoot: string, version: string): { added: boolean } {
  const p = join(repoRoot, "package.json");
  if (!existsSync(p)) return { added: false };
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return { added: false };
  }
  const deps = (pkg.devDependencies ?? {}) as Record<string, string>;
  if (deps.jejak) return { added: false };
  deps.jejak = `^${version}`;
  pkg.devDependencies = deps;
  writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return { added: true };
}
