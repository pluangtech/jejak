import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InitError } from "./errors.js";

/**
 * Refuse to operate (init/setup) inside jejak's own development repo — resolved from the CLI's
 * own package name (not a literal, so a rename can't bypass it). Hidden `--i-know-what-im-doing`
 * overrides. A missing/unparseable target package.json is treated as "not jejak" → proceed.
 */
export function assertNotSelfSetup(repoRoot: string, opts?: { iKnowWhatImDoing?: boolean }): void {
  if (opts?.iKnowWhatImDoing) return;
  const pkgPath = join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) return;
  let name: unknown;
  try {
    name = (JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown }).name;
  } catch {
    return;
  }
  if (typeof name === "string" && name === ownPackageName()) {
    throw new InitError(
      "jejak: refusing to operate in the jejak development repository.\n" +
        "Use a separate test project (see docs/CLI-SPEC.md).",
    );
  }
}

/** Resolve the running CLI's own package name by walking up to the nearest package.json. */
function ownPackageName(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const p = join(dir, "package.json");
    if (existsSync(p)) {
      try {
        return (JSON.parse(readFileSync(p, "utf8")) as { name?: string }).name ?? null;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
