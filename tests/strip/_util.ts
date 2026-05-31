import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type StripOptions, stripTranscript } from "../../src/strip/Stripper.js";
import { HashingPayloadSink } from "../../src/strip/payload/HashingPayloadSink.js";
import { ClaudeCodeJsonlReader } from "../../src/strip/transcript/ClaudeCodeJsonlReader.js";
import type { StrippedEvent } from "../../src/strip/types.js";

/** Write objects as a JSONL transcript file; return its path. */
export function writeJsonl(dir: string, objs: unknown[], name = "transcript.jsonl"): string {
  const p = join(dir, name);
  writeFileSync(p, `${objs.map((o) => JSON.stringify(o)).join("\n")}\n`);
  return p;
}

/** Strip a file with a real reader + hashing sink; collect the events. */
export async function stripFile(
  path: string,
  opts?: Partial<StripOptions>,
): Promise<StrippedEvent[]> {
  const events: StrippedEvent[] = [];
  for await (const e of stripTranscript(new ClaudeCodeJsonlReader(), path, {
    sink: new HashingPayloadSink(),
    ...opts,
  })) {
    events.push(e);
  }
  return events;
}
