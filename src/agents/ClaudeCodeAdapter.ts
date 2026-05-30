import type { AgentAdapter } from "./AgentAdapter.js";

/**
 * Claude Code — the only `supported` agent in v0.1.
 * Note [R-12]: a bare `.claude/` dir is a weak signal; the 1-detected case is a confirm,
 * not a silent commit, so it's the safety net.
 */
export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
  label: "Claude Code",
  supported: true,
  signalPaths: [".claude/settings.json", ".claude/settings.local.json", ".claude"],
};
