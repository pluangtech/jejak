import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InitError } from "../../errors.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/**
 * Refuse to initialize jejak inside its own development repo (resolved from the CLI's own
 * package name, not a literal, so a rename can't bypass it). Hidden `--i-know-what-im-doing`
 * overrides. A missing/unparseable target package.json is treated as "not jejak" → proceed.
 *
 * The git-work-tree check happens earlier in runInit (repoRoot resolution).
 */
export class GuardStep implements InitStep {
  readonly name = "guard";

  async run(ctx: InitContext): Promise<void> {
    if (ctx.flags.iKnowWhatImDoing) return;
    const pkgPath = join(ctx.repoRoot, "package.json");
    if (!existsSync(pkgPath)) return; // non-Node repo → not jejak
    let name: unknown;
    try {
      name = (JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown }).name;
    } catch {
      return; // unparseable → not jejak
    }
    if (typeof name === "string" && name === ownPackageName()) {
      throw new InitError(
        "jejak: refusing to initialize in the jejak development repository.\n" +
          "Use a separate test project (see docs/CLI-SPEC.md).",
      );
    }
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
