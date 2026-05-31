import type { CaptureContext } from "./CaptureContext.js";
import type { HookEvent } from "./payload.js";

/** Open/resume the session in the ledger; warn (dispatch log) on concurrent open sessions (AI-4). Fast, inline. */
export async function handleSessionStart(payload: HookEvent, ctx: CaptureContext): Promise<void> {
  ctx.ledger.openOrResume(payload.sessionId, payload.transcriptPath ?? null, ctx.now());
  const others = ctx.ledger.listOpen().filter((id) => id !== payload.sessionId);
  if (others.length > 0) {
    ctx.log(`session-start: ${others.length} other open session(s) — concurrent capture`);
  }
}
