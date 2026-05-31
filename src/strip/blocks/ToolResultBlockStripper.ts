import { PAYLOAD_THRESHOLD } from "../constants.js";
import type { StrippedBlock } from "../types.js";
import type { BlockStripper, StripContext } from "./BlockStripper.js";
import { preview, stringifyContent } from "./content.js";

/**
 * `tool_result` — the size driver. Inline if small; otherwise keep a head+tail preview + bytes +
 * sha and offload the full content to the sink (so it can be expanded / dedup'd later).
 */
export const toolResultBlockStripper: BlockStripper = {
  type: "tool_result",
  async strip(block, ctx: StripContext): Promise<StrippedBlock> {
    const out: StrippedBlock = { type: "tool_result" };
    if (block.tool_use_id != null) out.toolUseId = String(block.tool_use_id);
    if (block.is_error === true) out.isError = true;

    const content = stringifyContent(block.content);
    if (Buffer.byteLength(content, "utf8") <= PAYLOAD_THRESHOLD) {
      out.text = content;
    } else {
      const { sha, bytes } = await ctx.sink.put(content);
      out.preview = preview(content);
      out.sha = sha;
      out.bytes = bytes;
    }
    return out;
  },
};
