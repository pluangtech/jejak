import type { CaptureContext } from "../hooks/CaptureContext.js";
import { SingleFlight } from "./SingleFlight.js";
import { SnapshotWorker } from "./SnapshotWorker.js";

/** Run a snapshot under the per-session single-flight lock. Used by the Stop hook and `_worker`. */
export async function captureSnapshot(
  sessionId: string,
  ctx: CaptureContext,
  opts?: { final?: boolean },
): Promise<void> {
  const singleFlight = new SingleFlight(ctx.repoRoot, ctx.home);
  const worker = new SnapshotWorker({
    git: ctx.git,
    ledger: ctx.ledger,
    staging: ctx.staging,
    scanner: ctx.scanner,
    shadow: ctx.shadow,
    now: ctx.now,
  });
  await singleFlight.run(sessionId, () => worker.run(sessionId, opts));
}
