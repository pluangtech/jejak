import type { PayloadSink } from "../payload/PayloadSink.js";
import type { StrippedBlock } from "../types.js";

/** Cross-cutting context handed to every block stripper. */
export interface StripContext {
  /** Redact thinking blocks entirely (privacy opt-out). */
  stripThinking: boolean;
  /** Where bulk content is offloaded. */
  sink: PayloadSink;
}

/** Strategy for one content-block type. Returns null to drop the block. */
export interface BlockStripper {
  readonly type: string;
  strip(block: Record<string, unknown>, ctx: StripContext): Promise<StrippedBlock | null>;
}
