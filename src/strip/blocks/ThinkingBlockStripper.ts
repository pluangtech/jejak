import type { StrippedBlock } from "../types.js";
import type { BlockStripper, StripContext } from "./BlockStripper.js";

/**
 * `thinking` — kept **full verbatim** (the load-bearing, irrecoverable "why"; not the size
 * driver). `--strip-thinking` redacts it entirely (privacy opt-out only). Never truncated.
 */
export const thinkingBlockStripper: BlockStripper = {
  type: "thinking",
  async strip(block, ctx: StripContext): Promise<StrippedBlock> {
    if (ctx.stripThinking) return { type: "thinking", text: "[thinking redacted]" };
    return { type: "thinking", text: String(block.thinking ?? "") };
  },
};
