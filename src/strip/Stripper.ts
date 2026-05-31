import type { StripContext } from "./blocks/BlockStripper.js";
import { blockStripperFor } from "./blocks/registry.js";
import type { PayloadSink } from "./payload/PayloadSink.js";
import type { ReadOptions, TranscriptReader } from "./transcript/TranscriptReader.js";
import type { RawRecord, StrippedBlock, StrippedEvent } from "./types.js";

export interface StripOptions {
  fromOffset?: number;
  stripThinking?: boolean;
  sink: PayloadSink;
  onSkippedLine?: () => void;
  /** Called per emitted record with the byte offset AFTER it (resume point). */
  onProgress?: (offset: number) => void;
}

/** Line types that carry no trace value — dropped entirely. */
const NOISE_LINES = new Set(["agent-setting", "queue-operation", "attachment", "last-prompt"]);
/** Line types we emit as events. */
const KEPT_LINES = new Set(["user", "assistant", "summary", "system"]);

/**
 * Stream a transcript → stripped events. Reasoning (thinking) and actions (tool_use) are kept;
 * bulky tool output is offloaded to `opts.sink`. Constant memory; one event per kept line.
 */
export async function* stripTranscript(
  reader: TranscriptReader,
  path: string,
  opts: StripOptions,
): AsyncIterable<StrippedEvent> {
  const ctx: StripContext = { stripThinking: opts.stripThinking ?? false, sink: opts.sink };
  const readOpts: ReadOptions = {
    fromOffset: opts.fromOffset,
    onSkippedLine: opts.onSkippedLine,
    onProgress: opts.onProgress,
  };

  for await (const rec of reader.read(path, readOpts)) {
    if (NOISE_LINES.has(rec.lineType) || !KEPT_LINES.has(rec.lineType)) continue;
    yield await toStrippedEvent(rec, ctx);
  }
}

async function toStrippedEvent(rec: RawRecord, ctx: StripContext): Promise<StrippedEvent> {
  const raw = rec.raw;
  const event: StrippedEvent = {
    id: String(raw.uuid ?? ""),
    type: rec.lineType,
    content: [],
  };
  if (raw.parentUuid != null) event.parentId = String(raw.parentUuid);
  if (raw.timestamp != null) event.timestamp = String(raw.timestamp);

  if (rec.lineType === "summary") {
    event.content.push({ type: "text", text: String(raw.summary ?? "") });
    return event;
  }

  const message = raw.message as { role?: unknown; content?: unknown } | undefined;
  if (message?.role != null) event.role = String(message.role);

  const content = message?.content;
  if (typeof content === "string") {
    event.content.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const stripper = blockStripperFor(String(b.type ?? ""));
      event.content.push(
        stripper ? ((await stripper.strip(b, ctx)) ?? passthrough(b)) : passthrough(b),
      );
    }
  }
  return event;
}

/** Fallback for an unknown block type — keep it as compact text rather than lose it. */
function passthrough(block: Record<string, unknown>): StrippedBlock {
  return { type: String(block.type ?? "unknown"), text: JSON.stringify(block) };
}
