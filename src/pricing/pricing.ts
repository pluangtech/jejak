import type { Usage } from "../strip/types.js";

/**
 * Anthropic API list pricing (USD per 1M tokens), per platform.claude.com/docs/.../pricing
 * (verified 2026-06-01). Raw tokens+model stay the source of truth, so sessions are re-costable
 * when rates change — bump PRICING_VERSION + the table together.
 *
 * Cache rates are derived from base input via the documented multipliers (5m write 1.25×, 1h write
 * 2×, cache read/hit 0.1×). NOT modeled (v0.1, list price assumed): Batch −50%, fast-mode premium,
 * and the `inference_geo: "us"` +10% data-residency multiplier.
 */
export const PRICING_VERSION = "2026-06-01";

interface BaseRate {
  /** $ per 1M input tokens. */
  input: number;
  /** $ per 1M output tokens. */
  output: number;
}

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;

/** Resolve the base rate for a model id (e.g. "claude-opus-4-7"), or null if unknown. */
function baseRate(model: string): BaseRate | null {
  const m = model.toLowerCase();
  const major = Number(m.match(/-(\d+)/)?.[1] ?? 0);
  const minor = Number(m.match(/-\d+-(\d+)/)?.[1] ?? 0);

  if (m.includes("opus")) {
    // Opus 4.5+ → $5/$25; Opus 4.1 / 4 and earlier → legacy $15/$75.
    const isNew = major > 4 || (major === 4 && minor >= 5);
    return isNew ? { input: 5, output: 25 } : { input: 15, output: 75 };
  }
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("haiku")) {
    // Haiku 4.5+ → $1/$5; Haiku 3.5 → $0.80/$4.
    return major >= 4 ? { input: 1, output: 5 } : { input: 0.8, output: 4 };
  }
  return null; // unknown / "<synthetic>" → not costable
}

/** Cost in USD for a single usage record, or null if the model isn't in the table. */
export function costUsd(model: string | undefined, usage: Usage | undefined): number | null {
  if (!model || !usage) return null;
  const rate = baseRate(model);
  if (!rate) return null;

  const inputRate = rate.input / 1_000_000;
  const outputRate = rate.output / 1_000_000;

  // Cache writes: use the 5m/1h split when present; else price the total at the 5m rate.
  let write5m = usage.cacheCreation5mTokens;
  let write1h = usage.cacheCreation1hTokens;
  if (write5m == null && write1h == null) {
    write5m = usage.cacheCreationTokens ?? 0;
    write1h = 0;
  }

  return (
    (usage.inputTokens ?? 0) * inputRate +
    (usage.outputTokens ?? 0) * outputRate +
    (write5m ?? 0) * inputRate * CACHE_WRITE_5M +
    (write1h ?? 0) * inputRate * CACHE_WRITE_1H +
    (usage.cacheReadTokens ?? 0) * inputRate * CACHE_READ
  );
}
