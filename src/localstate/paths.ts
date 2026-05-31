import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/** Stable per-repo id for the local-state directory (so paths don't leak repo locations). */
export function repoHash(repoRoot: string): string {
  return createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
}

export interface LocalPaths {
  dir: string;
  ledgerDb: string;
  staging: string;
  locks: string;
  dispatchLog: string;
}

/** Per-developer, per-repo local state under `~/.jejak/<repo-hash>/` (never committed). */
export function localPaths(repoRoot: string, home = homedir()): LocalPaths {
  const dir = join(home, ".jejak", repoHash(repoRoot));
  return {
    dir,
    ledgerDb: join(dir, "ledger.db"),
    staging: join(dir, "staging"),
    locks: join(dir, "locks"),
    dispatchLog: join(dir, "dispatch.log"),
  };
}
