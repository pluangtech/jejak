import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { RawRecord } from "../types.js";
import type { ReadOptions, TranscriptReader } from "./TranscriptReader.js";

/**
 * Streaming reader for Claude Code `.jsonl` transcripts.
 * - Constant memory (line-by-line) on multi-MB files.
 * - Tracks the byte offset AFTER each emitted line (the resume point).
 * - `fromOffset` resumes at a byte boundary (`createReadStream({ start })`).
 * - A malformed JSON line is skipped (counted), never aborting the stream — a transcript may be
 *   mid-write. A trailing partial line that doesn't parse is likewise skipped.
 */
export class ClaudeCodeJsonlReader implements TranscriptReader {
  async *read(path: string, opts?: ReadOptions): AsyncIterable<RawRecord> {
    const start = opts?.fromOffset ?? 0;
    const stream = createReadStream(path, { start });
    const decoder = new StringDecoder("utf8");
    let buf = "";
    let offset = start; // byte offset just past the last consumed byte

    for await (const chunk of stream) {
      buf += decoder.write(chunk as Buffer);
      let nl: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard line-framing loop
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        offset += Buffer.byteLength(line, "utf8") + 1; // +1 for the newline
        const rec = parseLine(line, offset, opts);
        if (rec) {
          opts?.onProgress?.(offset);
          yield rec;
        }
      }
    }

    const tail = buf + decoder.end();
    if (tail.trim().length > 0) {
      offset += Buffer.byteLength(tail, "utf8");
      const rec = parseLine(tail, offset, opts);
      if (rec) {
        opts?.onProgress?.(offset);
        yield rec;
      }
    }
  }
}

function parseLine(line: string, offset: number, opts?: ReadOptions): RawRecord | null {
  if (line.trim().length === 0) return null;
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    return { offset, lineType: String(raw.type ?? ""), raw };
  } catch {
    opts?.onSkippedLine?.();
    return null;
  }
}
