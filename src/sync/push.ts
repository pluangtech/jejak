import type { Reporter } from "../app/AppDeps.js";
import type { SyncRepository } from "./SyncRepository.js";

export interface PushOptions {
  /** Result of loadCatalog(repoRoot).ok — the PII hard-gate. */
  catalogOk: boolean;
}

/** Thrown when the PII catalog won't load — push must refuse (never ship an unscrubbed trace). */
export class PushBlockedError extends Error {}

/** `jejak push` — share the shadow ref to origin, behind the PII hard-gate. */
export async function runPush(
  sync: SyncRepository,
  reporter: Reporter,
  opts: PushOptions,
): Promise<void> {
  if (!opts.catalogOk) {
    throw new PushBlockedError(
      "jejak: refusing to push — .jejak/pii.json failed to load. Fix or remove it, then retry.",
    );
  }

  const result = await sync.push();
  if (!result.pushed) {
    reporter.line("nothing to push — no local sessions captured yet");
  } else {
    reporter.line(
      `pushed shadow ref to origin${result.attempts > 1 ? ` (after ${result.attempts} attempts)` : ""}`,
    );
  }
  reporter.flush();
}
