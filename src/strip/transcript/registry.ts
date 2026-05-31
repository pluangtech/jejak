import { ClaudeCodeJsonlReader } from "./ClaudeCodeJsonlReader.js";
import type { TranscriptReader } from "./TranscriptReader.js";

/** Transcript-format registry. New agents (Cursor/Codex) add a reader here; strip is unchanged. */
const READERS: Record<string, () => TranscriptReader> = {
  "claude-code": () => new ClaudeCodeJsonlReader(),
};

export function readerFor(agentId: string): TranscriptReader {
  const make = READERS[agentId];
  if (!make) throw new Error(`jejak: no transcript reader for agent '${agentId}'`);
  return make();
}
