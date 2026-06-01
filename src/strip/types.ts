/** Stripped-trace data shapes (item 3). The canonical on-disk narrative format. */

/** One parsed transcript line, with the byte offset of the position AFTER it. */
export interface RawRecord {
  /** Byte offset in the source file immediately after this line (the resume point). */
  offset: number;
  /** The raw line `type` (e.g. "user", "assistant", "summary"). */
  lineType: string;
  /** The parsed JSON object. */
  raw: Record<string, unknown>;
}

/** A reference to offloaded bulk content, stored content-addressed by a PayloadSink. */
export interface Payload {
  sha: string;
  bytes: number;
}

/** One stripped content block. Bulk content is replaced by `preview` + `sha` + `bytes`. */
export interface StrippedBlock {
  type: string; // text | thinking | tool_use | tool_result | (passthrough)
  /** Text / full thinking / redaction marker / inline small tool_result. */
  text?: string;
  /** tool_use name. */
  name?: string;
  /** tool_use small input, kept inline. */
  input?: unknown;
  /** tool_use id / tool_result linkage. */
  toolUseId?: string;
  /** tool_result error flag. */
  isError?: boolean;
  /** Head+tail preview of an offloaded payload. */
  preview?: string;
  /** Content address of the full offloaded payload. */
  sha?: string;
  /** Full payload size in bytes. */
  bytes?: number;
}

/** Normalized token/usage metrics from an assistant message (the analytics core). */
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  /** 5-minute cache writes (priced 1.25× input). */
  cacheCreation5mTokens?: number;
  /** 1-hour cache writes (priced 2× input). */
  cacheCreation1hTokens?: number;
  cacheReadTokens?: number;
  serviceTier?: string;
  webSearchRequests?: number;
  webFetchRequests?: number;
}

/**
 * One stripped event — lossless: every analytics-relevant field is preserved (only bulk content
 * is offloaded to recoverable payload blobs, never dropped). Drives cost/efficiency/quality analysis.
 */
export interface StrippedEvent {
  id: string;
  parentId?: string;
  type: string;
  timestamp?: string;
  role?: string;
  // analytics (assistant messages)
  model?: string;
  usage?: Usage;
  stopReason?: string;
  requestId?: string;
  durationMs?: number; // system lines
  // context flags (for filtering/segmentation)
  isSidechain?: boolean;
  isMeta?: boolean;
  // content (user/assistant) or simple text (summary/system/ai-title/last-prompt)
  content?: StrippedBlock[];
  text?: string;
  /** Lossless catch-all for remaining small metadata fields (gitBranch, cwd, version, …). */
  meta?: Record<string, unknown>;
}
