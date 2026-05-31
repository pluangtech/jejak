import type { CaptureContext } from "./CaptureContext.js";
import type { HookEvent } from "./payload.js";

/** Final capture — spawn the detached worker so the hook returns immediately (<50 ms). */
export async function handleSessionEnd(payload: HookEvent, ctx: CaptureContext): Promise<void> {
  ctx.spawner.spawn(payload.sessionId, { final: true });
}
