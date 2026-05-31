import type { StripContext } from "./blocks/BlockStripper.js";
import { preview } from "./blocks/content.js";
import { blockStripperFor } from "./blocks/registry.js";
import { PAYLOAD_THRESHOLD } from "./constants.js";
import type { PayloadSink } from "./payload/PayloadSink.js";
import type { ReadOptions, TranscriptReader } from "./transcript/TranscriptReader.js";
import type { RawRecord, StrippedBlock, StrippedEvent, Usage } from "./types.js";

export interface StripOptions {
  fromOffset?: number;
  stripThinking?: boolean;
  sink: PayloadSink;
  onSkippedLine?: () => void;
  /** Called per emitted record with the byte offset AFTER it (resume point). */
  onProgress?: (offset: number) => void;
}

/**
 * Stream a transcript → stripped events. **Lossless:** every line is kept and every field is
 * preserved; only bulk content (tool output, large catch-all fields) is offloaded to `opts.sink`
 * as recoverable payload blobs. Thinking is kept full. Constant memory; one event per line.
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
    yield await toStrippedEvent(rec, ctx);
  }
}

/** Top-level fields captured explicitly (so they don't duplicate into `meta`). */
const CAPTURED = new Set([
  "uuid",
  "parentUuid",
  "type",
  "timestamp",
  "requestId",
  "isSidechain",
  "isMeta",
  "durationMs",
  "message",
  "content",
  "summary",
  "aiTitle",
  "lastPrompt",
  "sessionId",
]);

async function toStrippedEvent(rec: RawRecord, ctx: StripContext): Promise<StrippedEvent> {
  const raw = rec.raw;
  const event: StrippedEvent = { id: String(raw.uuid ?? ""), type: rec.lineType };
  if (raw.parentUuid != null) event.parentId = String(raw.parentUuid);
  if (raw.timestamp != null) event.timestamp = String(raw.timestamp);
  if (raw.requestId != null) event.requestId = String(raw.requestId);
  if (raw.isSidechain === true) event.isSidechain = true;
  if (raw.isMeta === true) event.isMeta = true;
  if (typeof raw.durationMs === "number") event.durationMs = raw.durationMs;

  const message = raw.message as
    | { role?: unknown; content?: unknown; model?: unknown; usage?: unknown; stop_reason?: unknown }
    | undefined;
  if (message?.role != null) event.role = String(message.role);
  if (typeof message?.model === "string") event.model = message.model;
  if (message?.usage && typeof message.usage === "object")
    event.usage = normalizeUsage(message.usage as Record<string, unknown>);
  if (typeof message?.stop_reason === "string") event.stopReason = message.stop_reason;

  // content (user/assistant message blocks) or a simple-text line
  const content = message?.content;
  if (typeof content === "string") {
    event.content = [{ type: "text", text: content }];
  } else if (Array.isArray(content)) {
    event.content = [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const stripper = blockStripperFor(String(b.type ?? ""));
      event.content.push(
        stripper ? ((await stripper.strip(b, ctx)) ?? passthrough(b)) : passthrough(b),
      );
    }
  } else {
    const text =
      raw.summary ??
      raw.aiTitle ??
      raw.lastPrompt ??
      (typeof raw.content === "string" ? raw.content : undefined);
    if (typeof text === "string") event.text = text;
  }

  // lossless catch-all for every remaining field (large values offloaded, never dropped)
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (CAPTURED.has(key) || value == null) continue;
    meta[key] = await compactValue(value, ctx);
  }
  if (Object.keys(meta).length > 0) event.meta = meta;

  return event;
}

function normalizeUsage(u: Record<string, unknown>): Usage {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const serverToolUse = (u.server_tool_use ?? {}) as Record<string, unknown>;
  return {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheCreationTokens: num(u.cache_creation_input_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    serviceTier: typeof u.service_tier === "string" ? u.service_tier : undefined,
    webSearchRequests: num(serverToolUse.web_search_requests),
    webFetchRequests: num(serverToolUse.web_fetch_requests),
  };
}

/** Keep a value verbatim if small; offload it to a payload blob if bulky (recoverable, not dropped). */
async function compactValue(value: unknown, ctx: StripContext): Promise<unknown> {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized == null || Buffer.byteLength(serialized, "utf8") <= PAYLOAD_THRESHOLD)
    return value;
  const { sha, bytes } = await ctx.sink.put(serialized);
  return { offloaded: true, sha, bytes, preview: preview(serialized) };
}

/** Fallback for an unknown block type — keep it as compact text rather than lose it. */
function passthrough(block: Record<string, unknown>): StrippedBlock {
  return { type: String(block.type ?? "unknown"), text: JSON.stringify(block) };
}
