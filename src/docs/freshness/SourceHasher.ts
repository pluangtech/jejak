import { createHash } from "node:crypto";
import { join } from "node:path";
import type { DocsFs } from "../DocsDeps.js";
import { parseDocPage } from "../model/DocPage.js";
import type { ConceptEntry } from "../registry/types.js";

/** Frontmatter key holding the recorded hash of a concept's bound sources at last review. */
export const SOURCES_HASH_KEY = "sources_hash";

export interface FreshnessResult {
  fresh: boolean;
  /** Hash computed from the sources right now. */
  actual: string;
  /** Hash recorded in the page frontmatter (empty if absent). */
  recorded: string;
  /** Sources that the registry lists but that are missing on disk. */
  missingSources: string[];
}

/**
 * Hashes a concept's bound source files so CI can flag "a source changed but the page didn't".
 * Promotes a slice of explanation-drift detection from judgment to a deterministic check.
 */
export class SourceHasher {
  constructor(
    private readonly fs: DocsFs,
    private readonly repoRoot: string,
  ) {}

  /** Stable hash over the concept's sources (sorted; path-qualified so renames are detected). */
  computeHash(entry: ConceptEntry): { hash: string; missingSources: string[] } {
    const hash = createHash("sha256");
    const missingSources: string[] = [];
    for (const rel of [...entry.sources].sort()) {
      const abs = join(this.repoRoot, rel);
      if (!this.fs.exists(abs)) {
        missingSources.push(rel);
        continue;
      }
      hash.update(rel);
      hash.update("\0");
      hash.update(this.fs.readFile(abs));
      hash.update("\0");
    }
    return { hash: `sha256:${hash.digest("hex")}`, missingSources };
  }

  /** Compare the page's recorded hash against the current source hash. */
  check(entry: ConceptEntry, pageContent: string): FreshnessResult {
    const { hash: actual, missingSources } = this.computeHash(entry);
    const recorded = parseDocPage(pageContent).frontmatter[SOURCES_HASH_KEY] ?? "";
    return {
      fresh: missingSources.length === 0 && recorded === actual,
      actual,
      recorded,
      missingSources,
    };
  }
}
