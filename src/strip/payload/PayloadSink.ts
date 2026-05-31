import type { Payload } from "../types.js";

/**
 * Where offloaded bulk content goes. Keeps the stripper storage-agnostic: `_dev strip` uses a
 * {@link HashingPayloadSink}; item 4's shadow-write injects a git-blob sink so the returned `sha`
 * resolves to a real, dedup'd git object (and `jejak show --expand` can fetch it later).
 */
export interface PayloadSink {
  /** Store `content` (idempotent by content) and return its content address + size. */
  put(content: string): Promise<Payload>;
}
