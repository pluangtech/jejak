/** Tunables for the strip pipeline (single source of truth — no magic numbers in strippers). */

/** Block content larger than this (bytes, UTF-8) is offloaded to a content-addressed payload. */
export const PAYLOAD_THRESHOLD = 2048;

/** Head/tail kept in a payload preview (chars). */
export const PREVIEW_HEAD = 512;
export const PREVIEW_TAIL = 256;

/**
 * Size guarantee (tested, not a runtime cap): because bulk tool output is offloaded, a
 * tool-heavy transcript's gzipped narrative is a small fraction of the raw transcript. Trace
 * size tracks conversation length (reasoning + prose kept full), NOT tool-output volume. Real
 * sessions land at ~3–5%; the test allows 2× margin. Typical session ≈ <500 KB gzipped (a
 * documented guideline, not a hard cap — a long reasoning-rich session legitimately exceeds it).
 */
export const NARRATIVE_GZIP_RATIO_MAX = 0.1;
