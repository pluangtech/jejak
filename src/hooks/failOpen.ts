import { isDisabled } from "./disabled.js";

/**
 * The cross-cutting hook contract (DESIGN-LLD §6.1, §9.1): check `.jejak/disabled` first, run the
 * handler, **never throw** (a capture failure must not block the agent), and log the duration to
 * the dispatch log. The caller (a commander action) returns normally afterwards → exit 0.
 */
export async function failOpen(
  opts: { repoRoot: string; hook: string; sessionId: string; log: (m: string) => void },
  fn: () => Promise<void>,
): Promise<void> {
  if (isDisabled(opts.repoRoot)) return;
  const start = Date.now();
  try {
    await fn();
  } catch (err) {
    opts.log(
      `${opts.hook} error (${opts.sessionId}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    opts.log(
      JSON.stringify({
        hook: opts.hook,
        session_id: opts.sessionId,
        duration_ms: Date.now() - start,
      }),
    );
  }
}
