import type { GitClient, TreeEntry } from "../git/GitClient.js";
import { SEED_FILES, SHADOW_COMMIT_MESSAGE, SHADOW_REF } from "./constants.js";

export interface EnsureResult {
  created: boolean;
}

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

  /** Register the `ours` merge driver (merge=ours is inert without it). Idempotent. */
  private async registerMergeDriver(): Promise<void> {
    await this.git.setConfig("merge.ours.driver", "true");
  }
}
