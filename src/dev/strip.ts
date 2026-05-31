import { existsSync } from "node:fs";
import { stripTranscript } from "../strip/Stripper.js";
import { HashingPayloadSink } from "../strip/payload/HashingPayloadSink.js";
import { readerFor } from "../strip/transcript/registry.js";

export interface DevStripOptions {
  path: string;
  resumeFrom?: number;
  stripThinking?: boolean;
  payloadsDir?: string;
  /** Transcript format; defaults to claude-code. */
  agent?: string;
}

/**
 * Hidden `_dev strip` entry point: stream a raw transcript → stripped events (JSONL) on `out`.
 * Throws on a missing/unreadable path (the CLI action maps that to a non-zero exit).
 */
export async function devStrip(
  opts: DevStripOptions,
  out: (chunk: string) => void = (s) => process.stdout.write(s),
  err: (chunk: string) => void = (s) => process.stderr.write(s),
): Promise<void> {
  if (!existsSync(opts.path)) {
    throw new Error(`jejak: cannot read transcript: ${opts.path}`);
  }
  const reader = readerFor(opts.agent ?? "claude-code");
  const sink = new HashingPayloadSink(opts.payloadsDir);
  let skipped = 0;

  for await (const event of stripTranscript(reader, opts.path, {
    fromOffset: opts.resumeFrom,
    stripThinking: opts.stripThinking,
    sink,
    onSkippedLine: () => {
      skipped += 1;
    },
  })) {
    out(`${JSON.stringify(event)}\n`);
  }

  if (skipped > 0) err(`jejak: skipped ${skipped} malformed line(s)\n`);
}
