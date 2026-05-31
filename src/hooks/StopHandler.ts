import { captureSnapshot } from "../capture/captureSnapshot.js";
import type { CaptureContext } from "./CaptureContext.js";
import type { HookEvent } from "./payload.js";

/** Per-turn snapshot — bounded inline (Claude's ~3 s Stop timeout), coalesced by single-flight. */
export async function handleStop(payload: HookEvent, ctx: CaptureContext): Promise<void> {
  await captureSnapshot(payload.sessionId, ctx, { final: false });
}
