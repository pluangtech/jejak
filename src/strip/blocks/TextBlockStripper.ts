import type { StrippedBlock } from "../types.js";
import type { BlockStripper } from "./BlockStripper.js";

/** `text` — passthrough (human-authored / model prose; not the size driver). */
export const textBlockStripper: BlockStripper = {
  type: "text",
  async strip(block): Promise<StrippedBlock> {
    return { type: "text", text: String(block.text ?? "") };
  },
};
