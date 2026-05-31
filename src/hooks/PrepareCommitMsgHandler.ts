import type { GitClient } from "../git/GitClient.js";
import type { SessionLedger } from "../ledger/SessionLedger.js";
import { isDisabled } from "./disabled.js";

export interface PrepareCommitMsgDeps {
  repoRoot: string;
  git: GitClient;
  ledger: SessionLedger;
}

/**
 * Stamp one `Jejak-Session:` trailer per open session onto the commit message (Δ-1, V3-1).
 * Inert when disabled or when there are no open sessions. The caller guarantees exit 0 always
 * (fail-open) — a trailer failure must never block the commit.
 */
export async function runPrepareCommitMsg(
  messageFile: string,
  deps: PrepareCommitMsgDeps,
): Promise<void> {
  if (isDisabled(deps.repoRoot)) return;
  const open = deps.ledger.listOpen();
  if (open.length === 0) return;
  await deps.git.interpretTrailers(
    messageFile,
    open.map((id) => `Jejak-Session: ${id}`),
  );
}
