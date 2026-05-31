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

/** One stripped event (one meaningful transcript line). */
export interface StrippedEvent {
  id: string;
  parentId?: string;
  type: string; // user | assistant | summary
  timestamp?: string;
  role?: string;
  content: StrippedBlock[];
}
