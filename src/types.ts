/** Shared interfaces — expanded in items 3–6. */

/** Supported + detect-only agent identifiers. */
export type AgentId = "claude-code" | "cursor";

/** Distribution mode chosen at init: project devDependency vs global install. */
export type JejakMode = "project" | "global";

/** Committed, repo-wide config (`.jejak/config.json`). Per-dev state lives elsewhere. */
export interface JejakConfig {
  v: 1;
  agent: AgentId;
  mode: JejakMode;
}

/** An agent the repo shows signals for. */
export interface DetectedAgent {
  id: AgentId;
  matchedSignals: string[];
  supported: boolean;
}

export interface StrippedEvent {
  id: string;
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SessionMeta {
  sessionId: string;
  agent?: string;
  startedAt?: string;
  [key: string]: unknown;
}

export interface HookPayload {
  sessionId?: string;
  cwd?: string;
  [key: string]: unknown;
}
