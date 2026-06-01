import type { Usage } from "../strip/types.js";

/**
 * Anthropic API list pricing (USD per 1M tokens), per platform.claude.com/docs/.../pricing
 * (verified 2026-06-01). Raw tokens+model stay the source of truth, so sessions are re-costable
 * when rates change — bump PRICING_VERSION + the table together.
 *
 * Cache rates are derived from base input via the documented multipliers (5m write 1.25×, 1h write
 * 2×, cache read/hit 0.1×). Modifiers folded in from captured `usage`:
 *   - fast mode (`speed: "fast"`) → premium Opus rates;
 *   - data residency (`inference_geo: "us"`) → 1.1× on all categories.
 * NOT modeled: Batch −50% (interactive Claude Code sessions are never batched — no signal).
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
const GEO_US_MULTIPLIER = 1.1;

/** Resolve the base rate for a model id (e.g. "claude-opus-4-7"), applying fast-mode if requested. */
function baseRate(model: string, fast: boolean): BaseRate | null {
  const m = model.toLowerCase();
  const major = Number(m.match(/-(\d+)/)?.[1] ?? 0);
  const minor = Number(m.match(/-\d+-(\d+)/)?.[1] ?? 0);

  if (m.includes("opus")) {
    // Opus 4.5+ → $5/$25; Opus 4.1 / 4 and earlier → legacy $15/$75.
    const isNew = major > 4 || (major === 4 && minor >= 5);
    if (!isNew) return { input: 15, output: 75 }; // legacy — no fast tier
    if (fast) {
      // Fast mode (research preview): Opus 4.8+/Next $10/$50; Opus 4.6/4.7 $30/$150 (4.5 has none).
      if (major > 4 || minor >= 8) return { input: 10, output: 50 };
      if (minor >= 6) return { input: 30, output: 150 };
    }
    return { input: 5, output: 25 };
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
  const rate = baseRate(model, usage.speed === "fast");
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

  const base =
    (usage.inputTokens ?? 0) * inputRate +
    (usage.outputTokens ?? 0) * outputRate +
    (write5m ?? 0) * inputRate * CACHE_WRITE_5M +
    (write1h ?? 0) * inputRate * CACHE_WRITE_1H +
    (usage.cacheReadTokens ?? 0) * inputRate * CACHE_READ;

  // Data residency: us-only inference is +10% across all token categories.
  return usage.inferenceGeo === "us" ? base * GEO_US_MULTIPLIER : base;
}
