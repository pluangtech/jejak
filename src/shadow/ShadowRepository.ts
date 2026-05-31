import { gzipSync } from "node:zlib";
import type { GitClient, TreeEntry } from "../git/GitClient.js";
import { SEED_FILES, SHADOW_COMMIT_MESSAGE, SHADOW_REF } from "./constants.js";
import { sessionPath } from "./sessionPath.js";

export interface EnsureResult {
  created: boolean;
}

/** A session to write to the shadow ref. */
export interface UpsertInput {
  handle: string;
  sessionId: string;
  /** Newline-joined stripped events (the narrative). Gzipped on write. */
  eventsJsonl: string;
  /** Session metadata (written as meta.json). */
  meta: object;
  /** Content-addressed payload tree entries from a {@link GitBlobPayloadSink}. */
  payloadEntries?: TreeEntry[];
}

export interface UpsertResult {
  commit: string;
  path: string;
}

const FILE_MODE = "100644";
const CAS_RETRIES = 5;

/**
 * Owns all mutation of the shadow ref.
 *
 * Invariant: the shadow ref is only ever built/mutated through git plumbing
 * (hash-object → write-tree → commit-tree → update-ref). It is NEVER checked out, so HEAD and
 * the developer's working tree always stay on their own branch.
 */
export class ShadowRepository {
  constructor(private readonly git: GitClient) {}

  /**
   * Idempotently ensure the orphan shadow ref + seed tree exist, and that the `ours` merge
   * driver is registered. Safe to call from init or lazily from the capture/hook path.
   */
  async ensure(): Promise<EnsureResult> {
    if (await this.git.refExists(SHADOW_REF)) {
      await this.registerMergeDriver();
      return { created: false };
    }

    const entries: TreeEntry[] = [];
    for (const file of SEED_FILES) {
      const sha = await this.git.hashObject(file.content);
      entries.push({ mode: file.mode, sha, path: file.path });
    }

    const tree = await this.git.writeTreeFromIndex(entries);
    const commit = await this.git.commitTree(tree, SHADOW_COMMIT_MESSAGE); // orphan (no -p)
    // CAS: empty old-value = "must not already exist"; fails atomically if a concurrent init won.
    const won = await this.git.updateRefCAS(SHADOW_REF, commit, "");

    await this.registerMergeDriver();
    return { created: won };
  }

  /**
   * Write one session onto the shadow ref: `sessions/<handle>/<shard>/<id>/{events.jsonl.gz,
   * meta.json}` plus any `payloads/<sha>` blobs. Composes a new tree on top of the current
   * shadow tree and CAS-advances the ref (parented commit) — never checks the ref out. Retries
   * on a lost CAS race by rebasing onto the new tip.
   */
  async upsert(input: UpsertInput): Promise<UpsertResult> {
    let base = await this.git.resolveRef(SHADOW_REF);
    if (base == null) {
      await this.ensure();
      base = await this.git.resolveRef(SHADOW_REF);
    }
    if (base == null) throw new Error("jejak: shadow ref missing after ensure()");

    const path = sessionPath(input.handle, input.sessionId);
    const eventsOid = await this.git.hashObject(gzipSync(Buffer.from(input.eventsJsonl, "utf8")));
    const metaOid = await this.git.hashObject(`${JSON.stringify(input.meta, null, 2)}\n`);
    const entries: TreeEntry[] = [
      { mode: FILE_MODE, sha: eventsOid, path: `${path}/events.jsonl.gz` },
      { mode: FILE_MODE, sha: metaOid, path: `${path}/meta.json` },
      ...(input.payloadEntries ?? []),
    ];

    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const tree = await this.git.writeTreeFromIndex(entries, base);
      // Tree-hash dedup (Finn §5.4): if the composed tree equals the current tip's tree, the
      // content is already stored — skip the commit entirely so re-capture is a true no-op.
      if (tree === (await this.git.resolveRef(`${base}^{tree}`))) {
        return { commit: base, path };
      }
      const commit = await this.git.commitTree(tree, `jejak: capture ${input.sessionId}`, [base]);
      if (await this.git.updateRefCAS(SHADOW_REF, commit, base)) {
        return { commit, path };
      }
      const next = await this.git.resolveRef(SHADOW_REF); // lost the race — rebuild onto the new tip
      if (next == null || next === base)
        throw new Error("jejak: shadow ref CAS failed unexpectedly");
      base = next;
    }
    throw new Error(`jejak: shadow upsert failed after ${CAS_RETRIES} attempts (contention)`);
  }

  /** Register the `ours` merge driver (merge=ours is inert without it). Idempotent. */
  private async registerMergeDriver(): Promise<void> {
    await this.git.setConfig("merge.ours.driver", "true");
  }
}
