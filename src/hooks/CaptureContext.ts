import { appendFileSync, mkdirSync } from "node:fs";
import { StagingStore } from "../capture/StagingStore.js";
import { DetachedWorkerSpawner, type WorkerSpawner } from "../capture/WorkerSpawner.js";
import { type GitClient, RealGitClient } from "../git/GitClient.js";
import { SessionLedger } from "../ledger/SessionLedger.js";
import { localPaths } from "../localstate/paths.js";
import { NoopPiiScanner, type PiiScanner } from "../pii/PiiScanner.js";
import { ShadowRepository } from "../shadow/ShadowRepository.js";

/** Everything the hook handlers + worker need, injected so tests use fakes (no real Claude/SQLite-on-disk/spawn). */
export interface CaptureContext {
  repoRoot: string;
  git: GitClient;
  ledger: SessionLedger;
  staging: StagingStore;
  scanner: PiiScanner;
  shadow: ShadowRepository;
  spawner: WorkerSpawner;
  now: () => string;
  log: (message: string) => void;
  /** Home override (tests). */
  home?: string;
}

/** Build the production context for a repo (real git, SQLite ledger, dispatch-log writer). */
export function createCaptureContext(
  repoRoot: string,
  git: GitClient = new RealGitClient(repoRoot),
): CaptureContext {
  const lp = localPaths(repoRoot);
  return {
    repoRoot,
    git,
    ledger: new SessionLedger(lp.ledgerDb),
    staging: new StagingStore(repoRoot),
    scanner: new NoopPiiScanner(),
    shadow: new ShadowRepository(git),
    spawner: new DetachedWorkerSpawner(),
    now: () => new Date().toISOString(),
    log: (message) => {
      try {
        mkdirSync(lp.dir, { recursive: true });
        appendFileSync(lp.dispatchLog, `${message}\n`, "utf8");
      } catch {
        // dispatch logging is best-effort
      }
    },
  };
}
