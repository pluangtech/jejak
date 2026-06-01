/** One parsed dispatch-log record (written by {@link failOpen} — one JSON line per hook dispatch). */
export interface DispatchRecord {
  ts?: string;
  hook: string;
  session_id?: string;
  duration_ms: number;
  error?: string;
}

export interface HookTiming {
  hook: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface DispatchSummary {
  /** Dispatches that recorded an error within the last `windowDays`. */
  errorCount: number;
  /** Per-hook latency percentiles over all parsed records. */
  timings: HookTiming[];
}

/** Agent hooks bounded by Claude's hook timeout — flagged if p95 exceeds the budget. */
export const AGENT_HOOKS = new Set([
  "SessionStart",
  "Stop",
  "SessionEnd",
  "session-start",
  "session-end",
]);
export const HOOK_P95_BUDGET_MS = 50;

/** Parse the dispatch log (best-effort — skip malformed lines). */
export function parseDispatchLog(content: string): DispatchRecord[] {
  const records: DispatchRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const rec = JSON.parse(trimmed) as DispatchRecord;
      if (typeof rec.hook === "string" && typeof rec.duration_ms === "number") records.push(rec);
    } catch {
      // ignore non-JSON / legacy lines
    }
  }
  return records;
}

/** Nearest-rank percentile of a numeric sample (sorted ascending). */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1];
}

/**
 * Summarize a dispatch log: count recent errors and compute per-hook p50/p95/p99. `nowMs`/`windowDays`
 * are injected for deterministic tests; records without a parseable `ts` always count toward errors.
 */
export function summarizeDispatch(
  records: DispatchRecord[],
  opts: { nowMs: number; windowDays?: number },
): DispatchSummary {
  const windowMs = (opts.windowDays ?? 7) * 24 * 60 * 60 * 1000;
  const cutoff = opts.nowMs - windowMs;

  let errorCount = 0;
  const byHook = new Map<string, number[]>();
  for (const rec of records) {
    if (rec.error !== undefined) {
      const t = rec.ts ? Date.parse(rec.ts) : Number.NaN;
      if (Number.isNaN(t) || t >= cutoff) errorCount++;
    }
    const arr = byHook.get(rec.hook) ?? [];
    arr.push(rec.duration_ms);
    byHook.set(rec.hook, arr);
  }

  const timings: HookTiming[] = [...byHook.entries()]
    .map(([hook, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        hook,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      };
    })
    .sort((a, b) => a.hook.localeCompare(b.hook));

  return { errorCount, timings };
}
