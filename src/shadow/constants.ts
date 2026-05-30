/**
 * Single source of truth for the shadow-ref name, schema version, and seed-tree layout.
 * Shared between Phase A bootstrap (ShadowRepository.ensure) and the future Phase B upsert
 * path so the v1 → v2 layout can never drift between the two.
 */

/** The orphan ref that holds all session traces. Never checked out. */
export const SHADOW_REF = "refs/heads/jejak/sessions/v1";

/** Shadow storage layout version. */
export const SHADOW_VERSION = "1";

/*
 * Merge rules committed into the seed tree ONLY (never the working tree):
 * - "sessions" glob -> merge=ours: keep our copy of immutable session blobs on conflict
 *   (requires `git config merge.ours.driver true`; git has no built-in `ours` driver).
 * - the index ndjson -> merge=union: concatenate concurrent appends to the append-only index
 *   (NOT ours, which would drop concurrent writes). `union` is built-in.
 */
export const SHADOW_GITATTRIBUTES =
  "sessions/** merge=ours\n" + "index/**/by-commit.ndjson merge=union\n" + "*.jsonl.gz binary\n";

export const SHADOW_README =
  "# Jejak session traces\n\n" +
  "This is an orphan branch managed by jejak. Do not check it out for normal work.\n";

export const SHADOW_COMMIT_MESSAGE = "jejak: initialize shadow sessions v1";

/** A file written into the seed tree at ref creation. */
export interface SeedFile {
  path: string;
  mode: string;
  content: string;
}

/** Seed-tree contents. `sessions/` and `index/` are omitted — first upsert creates them. */
export const SEED_FILES: SeedFile[] = [
  { path: ".gitattributes", mode: "100644", content: SHADOW_GITATTRIBUTES },
  { path: "README.md", mode: "100644", content: SHADOW_README },
  { path: "VERSION", mode: "100644", content: `${SHADOW_VERSION}\n` },
];
