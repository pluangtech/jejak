import { existsSync } from "node:fs";
import { join } from "node:path";
import { InitError } from "../errors.js";
import type { AgentId, DetectedAgent } from "../types.js";
import type { AgentAdapter } from "./AgentAdapter.js";
import { claudeCodeAdapter } from "./ClaudeCodeAdapter.js";
import { cursorAdapter } from "./CursorAdapter.js";

/** Fixed scan order. Picker display order is the same (supported first by construction). */
export const AGENT_REGISTRY: AgentAdapter[] = [claudeCodeAdapter, cursorAdapter];

export function findAdapter(id: string): AgentAdapter | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}

export function supportedAdapters(): AgentAdapter[] {
  return AGENT_REGISTRY.filter((a) => a.supported);
}

/** Scan the repo root for each agent's signals. */
export function detectAgents(repoRoot: string): DetectedAgent[] {
  const detected: DetectedAgent[] = [];
  for (const a of AGENT_REGISTRY) {
    const matchedSignals = a.signalPaths.filter((p) => existsSync(join(repoRoot, p)));
    if (matchedSignals.length > 0) {
      detected.push({ id: a.id, matchedSignals, supported: a.supported });
    }
  }
  return detected;
}

/** Validate a `--agent <id>` flag against the supported registry (explicit user intent). */
export function validateAgentFlag(id: string): AgentId {
  const a = findAdapter(id);
  const supported = supportedAdapters()
    .map((s) => s.id)
    .join(", ");
  if (!a) throw new InitError(`jejak: unknown agent '${id}'. supported: ${supported}`);
  if (!a.supported)
    throw new InitError(`jejak: agent '${id}' is not supported yet. supported: ${supported}`);
  return a.id;
}
