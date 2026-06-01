import { gunzipSync } from "node:zlib";
import type { SessionMeta } from "../analytics/aggregate.js";
import type { GitClient } from "../git/GitClient.js";
import { SHADOW_REF } from "../shadow/constants.js";
import type { StrippedEvent } from "../strip/types.js";

/** One captured session as read back from the shadow ref. */
export interface SessionEntry {
  /** The slugified handle as it appears in the tree path (`sessions/<handleSlug>/…`). */
  handleSlug: string;
  sessionId: string;
  meta: SessionMeta;
}

/**
 * Repository that reads captured sessions back from the shadow ref (item 6b). The ref — not the
 * per-dev ledger — is the source of truth: `meta.json` is cross-dev and survives fetch. Read-only;
 * the ref is never checked out (all access is `git ls-tree` / `git cat-file`).
 */
export class SessionReader {
  constructor(
    private readonly git: GitClient,
    private readonly ref: string = SHADOW_REF,
  ) {}

  /** All sessions on the ref, newest first; optionally filtered to one slugified handle. */
  async list(opts?: { handleSlug?: string }): Promise<SessionEntry[]> {
    const files = await this.git.lsTree(this.ref, "sessions/", { recursive: true });
    const entries: SessionEntry[] = [];
    for (const path of files) {
      if (!path.endsWith("/meta.json")) continue;
      // sessions/<handleSlug>/<shard>/<sessionId>/meta.json
      const parts = path.split("/");
      if (parts.length !== 5) continue;
      const [, handleSlug, , sessionId] = parts;
      if (opts?.handleSlug && handleSlug !== opts.handleSlug) continue;
      const meta = await this.readMeta(path);
      if (meta) entries.push({ handleSlug, sessionId, meta });
    }
    return entries.sort((a, b) => (b.meta.started_at ?? "").localeCompare(a.meta.started_at ?? ""));
  }

  /** Find a session by id across all handles (prefers an exact id match), or null. */
  async find(sessionId: string): Promise<SessionEntry | null> {
    const all = await this.list();
    return all.find((e) => e.sessionId === sessionId) ?? null;
  }

  /** The full stripped event stream for a session (gunzipped JSONL). */
  async events(handleSlug: string, sessionId: string): Promise<StrippedEvent[]> {
    const shard = sessionId.slice(0, 2).toLowerCase();
    const path = `sessions/${handleSlug}/${shard}/${sessionId}/events.jsonl.gz`;
    const gz = await this.git.catBlob(`${this.ref}:${path}`);
    const jsonl = gunzipSync(gz).toString("utf8");
    return jsonl
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as StrippedEvent);
  }

  /** Resolve an offloaded payload blob by its content address. */
  async payload(sha: string): Promise<Buffer> {
    return this.git.catBlob(`${this.ref}:payloads/${sha}`);
  }

  private async readMeta(path: string): Promise<SessionMeta | null> {
    try {
      const buf = await this.git.catBlob(`${this.ref}:${path}`);
      return JSON.parse(buf.toString("utf8")) as SessionMeta;
    } catch {
      return null; // skip an unreadable/corrupt meta rather than failing the whole listing
    }
  }
}
