import { execFileSync } from "node:child_process";

/**
 * Absolute path to the running `jejak` CLI, for embedding into global-mode hook scripts.
 * Prefers `which jejak`; falls back to the running script. (Project mode ignores this — it uses
 * the portable `npx jejak`.)
 */
export function resolveCliPath(): string {
  try {
    const which = execFileSync("which", ["jejak"], { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {
    // not on PATH — fall through
  }
  return process.argv[1] ?? "jejak";
}
