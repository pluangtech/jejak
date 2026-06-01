import type { GitClient } from "../git/GitClient.js";
import { SHADOW_REF } from "../shadow/constants.js";

/** What `fetch` did with the remote tip relative to our local ref. */
export type FetchAction = "none" | "adopt" | "uptodate" | "fast-forward" | "merge";

export interface FetchResult {
  /** True if the remote had a shadow ref to fetch at all. */
  fetched: boolean;
  action: FetchAction;
}

export interface PushResult {
  pushed: boolean;
  attempts: number;
}

/** Pick the merge action from how local and remote diverge. Pure — unit-tested directly. */
export function decideMerge(
  aheadOfThem: number,
  behindThem: number,
): "uptodate" | "fast-forward" | "merge" {
  if (behindThem === 0) return "uptodate"; // we already have all their commits
  if (aheadOfThem === 0) return "fast-forward"; // they strictly extend us
  return "merge"; // diverged
}

const CAS_RETRIES = 5;

/**
 * Syncs the shadow ref to/from a remote (item 6c). The ref is an orphan that is NEVER checked out,
 * so merges run as pure plumbing: `git merge-tree --write-tree` → `commit-tree` → CAS `update-ref`,
 * honoring the seed `.gitattributes` drivers. Merges are conflict-free by construction (each dev
 * owns a disjoint `sessions/<handle>/…` partition).
 */
export class SyncRepository {
  constructor(
    private readonly git: GitClient,
    private readonly ref: string = SHADOW_REF,
    private readonly remote: string = "origin",
  ) {}

  /** Fetch the remote tip and integrate it into the local ref (adopt / fast-forward / merge). */
  async fetch(): Promise<FetchResult> {
    const theirs = await this.git.fetch(this.remote, this.ref);
    if (theirs == null) return { fetched: false, action: "none" };

    const ours = await this.git.resolveRef(this.ref);
    if (ours == null) {
      // We have no local ref yet → adopt the remote tip wholesale.
      await this.git.updateRefCAS(this.ref, theirs, "");
      return { fetched: true, action: "adopt" };
    }

    const action = await this.mergeInto(theirs);
    return { fetched: true, action };
  }

  /** Push the local ref, merging in the remote tip and retrying on a non-fast-forward rejection. */
  async push(): Promise<PushResult> {
    if ((await this.git.resolveRef(this.ref)) == null) return { pushed: false, attempts: 0 };

    for (let attempt = 1; attempt <= CAS_RETRIES; attempt++) {
      if (await this.git.push(this.remote, this.ref)) return { pushed: true, attempts: attempt };
      await this.fetch(); // rejected → integrate their tip, then retry
    }
    throw new Error(`jejak: push failed after ${CAS_RETRIES} attempts (contention)`);
  }

  /** Advance the local ref to include `theirs`. CAS loop mirrors ShadowRepository.upsert. */
  private async mergeInto(theirs: string): Promise<"uptodate" | "fast-forward" | "merge"> {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const ours = await this.git.resolveRef(this.ref);
      if (ours == null) throw new Error("jejak: local shadow ref vanished during merge");

      const ahead = await this.git.revListCount(`${theirs}..${ours}`);
      const behind = await this.git.revListCount(`${ours}..${theirs}`);
      const action = decideMerge(ahead, behind);

      if (action === "uptodate") return action;
      if (action === "fast-forward") {
        if (await this.git.updateRefCAS(this.ref, theirs, ours)) return action;
      } else {
        const tree = await this.git.mergeTree(ours, theirs);
        const commit = await this.git.commitTree(tree, "jejak: merge origin", [ours, theirs]);
        if (await this.git.updateRefCAS(this.ref, commit, ours)) return action;
      }
      // lost the CAS race → re-resolve and retry
    }
    throw new Error(`jejak: shadow merge failed after ${CAS_RETRIES} attempts (contention)`);
  }
}
