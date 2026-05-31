import type { Usage } from "../strip/types.js";

/**
 * Bundled model pricing (USD per 1M tokens). Stamp the version so stored `cost_usd` is
 * interpretable and historical sessions can be re-costed from raw tokens+model when rates change.
 * Approximate v0.1 rates — tune as needed; raw tokens remain the source of truth.
 */
export const PRICING_VERSION = "2026-05-31";

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Matched by substring against the model id (e.g. "claude-opus-4-7"). First match wins. */
const TABLE: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: /sonnet/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /haiku/i, price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } },
];

/** Cost in USD for a single usage record, or null if the model isn't in the table. */
export function costUsd(model: string | undefined, usage: Usage | undefined): number | null {
  if (!model || !usage) return null;
  const entry = TABLE.find((t) => t.match.test(model));
  if (!entry) return null;
  const { input, output, cacheWrite, cacheRead } = entry.price;
  const total =
    (usage.inputTokens ?? 0) * input +
    (usage.outputTokens ?? 0) * output +
    (usage.cacheCreationTokens ?? 0) * cacheWrite +
    (usage.cacheReadTokens ?? 0) * cacheRead;
  return total / 1_000_000;
}
