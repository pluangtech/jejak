import type { RawRecord } from "../types.js";

export interface ReadOptions {
  /** Byte offset to resume from (start reading at the next line boundary ≥ this). */
  fromOffset?: number;
  /** Called once per malformed (unparseable) line, which is skipped. */
  onSkippedLine?: () => void;
}

/**
 * Reads a transcript into a stream of {@link RawRecord}s. Adapter per agent format; the stripper
 * is format-agnostic. Implementations stream (constant memory) and report byte offsets for resume.
 */
export interface TranscriptReader {
  read(path: string, opts?: ReadOptions): AsyncIterable<RawRecord>;
}
