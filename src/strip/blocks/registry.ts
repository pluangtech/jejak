import type { BlockStripper } from "./BlockStripper.js";
import { textBlockStripper } from "./TextBlockStripper.js";
import { thinkingBlockStripper } from "./ThinkingBlockStripper.js";
import { toolResultBlockStripper } from "./ToolResultBlockStripper.js";
import { toolUseBlockStripper } from "./ToolUseBlockStripper.js";

const STRIPPERS: BlockStripper[] = [
  textBlockStripper,
  thinkingBlockStripper,
  toolUseBlockStripper,
  toolResultBlockStripper,
];

const BY_TYPE = new Map<string, BlockStripper>(STRIPPERS.map((s) => [s.type, s]));

/** Look up the stripper for a content-block type (undefined → caller applies a fallback). */
export function blockStripperFor(type: string): BlockStripper | undefined {
  return BY_TYPE.get(type);
}
