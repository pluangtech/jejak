import type { CaptureContext } from "./CaptureContext.js";
import { handleSessionEnd } from "./SessionEndHandler.js";
import { handleSessionStart } from "./SessionStartHandler.js";
import { handleStop } from "./StopHandler.js";
import type { HookEvent } from "./payload.js";

type Handler = (payload: HookEvent, ctx: CaptureContext) => Promise<void>;

/** Agent-event → handler registry. Adding an event = a new handler entry. */
const HANDLERS: Record<string, Handler> = {
  "session-start": handleSessionStart,
  stop: handleStop,
  "session-end": handleSessionEnd,
};

export function isHookEvent(name: string): boolean {
  return name in HANDLERS;
}

export async function dispatchHook(
  event: string,
  payload: HookEvent,
  ctx: CaptureContext,
): Promise<void> {
  const handler = HANDLERS[event];
  if (handler) await handler(payload, ctx);
}
