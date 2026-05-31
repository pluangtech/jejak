import { slugify } from "../handle/slugify.js";

/** Hash shard = first 2 chars of the session id, lowercased (~256 shards/handle). */
export function shardFor(sessionId: string): string {
  return sessionId.slice(0, 2).toLowerCase();
}

/**
 * Per-writer, balanced tree path for a session (DESIGN-LLD §2/§11):
 * `sessions/<handle>/<shard>/<session-id>/`. Handle is slugified for safety.
 */
export function sessionPath(handle: string, sessionId: string): string {
  const h = slugify(handle) ?? handle;
  return `sessions/${h}/${shardFor(sessionId)}/${sessionId}`;
}
