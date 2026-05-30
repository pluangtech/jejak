import type { AgentAdapter } from "./AgentAdapter.js";

/**
 * Cursor — detected for messaging only; not selectable until its adapter ships (v0.2).
 */
export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  label: "Cursor",
  supported: false,
  signalPaths: [".cursor"],
};
