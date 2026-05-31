import { PRICING_VERSION, costUsd } from "../pricing/pricing.js";
import type { StrippedEvent } from "../strip/types.js";

/** Session metadata written to meta.json — the analytics summary over the full event set. */
export interface SessionMeta {
  v: 1;
  session_id: string;
  agent: string;
  dev_handle: string;
  status: string;
  event_count: number;
  turn_count: number;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  models: string[];
  tokens: { input: number; output: number; cache_creation: number; cache_read: number };
  web_tool_use: { search: number; fetch: number };
  cost_usd: number | null;
  pricing_version: string;
  commit_sha?: string;
}

export interface SessionMetaInput {
  sessionId: string;
  handle: string;
  agent: string;
  status: string;
  commitSha?: string;
}

/** Aggregate token usage, cost, turns, duration, and models from a session's stripped events. */
export function buildSessionMeta(events: StrippedEvent[], input: SessionMetaInput): SessionMeta {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let search = 0;
  let fetch = 0;
  let cost = 0;
  let costKnown = false;
  const models = new Set<string>();
  const requestIds = new Set<string>();
  const timestamps: string[] = [];

  for (const e of events) {
    if (e.timestamp) timestamps.push(e.timestamp);
    if (e.requestId) requestIds.add(e.requestId);
    if (e.model) models.add(e.model);
    if (e.usage) {
      inputTokens += e.usage.inputTokens ?? 0;
      outputTokens += e.usage.outputTokens ?? 0;
      cacheCreation += e.usage.cacheCreationTokens ?? 0;
      cacheRead += e.usage.cacheReadTokens ?? 0;
      search += e.usage.webSearchRequests ?? 0;
      fetch += e.usage.webFetchRequests ?? 0;
      const c = costUsd(e.model, e.usage);
      if (c != null) {
        cost += c;
        costKnown = true;
      }
    }
  }

  timestamps.sort();
  const startedAt = timestamps[0] ?? null;
  const endedAt = timestamps[timestamps.length - 1] ?? null;
  const durationMs = startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null;

  return {
    v: 1,
    session_id: input.sessionId,
    agent: input.agent,
    dev_handle: input.handle,
    status: input.status,
    event_count: events.length,
    turn_count: requestIds.size, // distinct request ids ≈ agent turns
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs,
    models: [...models],
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cache_creation: cacheCreation,
      cache_read: cacheRead,
    },
    web_tool_use: { search, fetch },
    cost_usd: costKnown ? Math.round(cost * 1e6) / 1e6 : null,
    pricing_version: PRICING_VERSION,
    ...(input.commitSha ? { commit_sha: input.commitSha } : {}),
  };
}
