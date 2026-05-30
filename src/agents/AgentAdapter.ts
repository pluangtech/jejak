import type { AgentId } from "../types.js";

/**
 * One supported (or detect-only) AI agent. Adding Cursor/Codex later = a new adapter file;
 * detection and the picker never change.
 */
export interface AgentAdapter {
  readonly id: AgentId;
  readonly label: string;
  /** Whether jejak can capture this agent in v0.1 (only `claude-code` is true). */
  readonly supported: boolean;
  /** Repo-root-relative paths whose presence signals this agent. */
  readonly signalPaths: string[];
}
