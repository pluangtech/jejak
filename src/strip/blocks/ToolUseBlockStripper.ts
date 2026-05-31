import { PAYLOAD_THRESHOLD } from "../constants.js";
import type { StrippedBlock } from "../types.js";
import type { BlockStripper, StripContext } from "./BlockStripper.js";
import { preview } from "./content.js";

/**
 * `tool_use` — keep `name` + `input` inline (small, high-signal: what the agent decided to do).
 * Only a payload-sized input (e.g. a `Write` file body) is offloaded to the sink.
 */
export const toolUseBlockStripper: BlockStripper = {
  type: "tool_use",
  async strip(block, ctx: StripContext): Promise<StrippedBlock> {
    const out: StrippedBlock = { type: "tool_use", name: String(block.name ?? "") };
    if (block.id != null) out.toolUseId = String(block.id);

    const inputStr = JSON.stringify(block.input ?? null);
    if (Buffer.byteLength(inputStr, "utf8") <= PAYLOAD_THRESHOLD) {
      out.input = block.input;
    } else {
      const { sha, bytes } = await ctx.sink.put(inputStr);
      out.preview = preview(inputStr);
      out.sha = sha;
      out.bytes = bytes;
    }
    return out;
  },
};
