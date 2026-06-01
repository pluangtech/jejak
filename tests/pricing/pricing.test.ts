import { describe, expect, it } from "vitest";
import { costUsd } from "../../src/pricing/pricing.js";

const M = 1_000_000;

describe("costUsd", () => {
  it("prices Opus 4.5+ at $5 / $25 (not the legacy $15/$75)", () => {
    expect(costUsd("claude-opus-4-7", { inputTokens: M, outputTokens: M })).toBeCloseTo(30, 6);
    expect(costUsd("claude-opus-4-5", { inputTokens: M })).toBeCloseTo(5, 6);
  });

  it("prices legacy Opus 4.1 / 4 at $15 / $75", () => {
    expect(costUsd("claude-opus-4-1", { inputTokens: M, outputTokens: M })).toBeCloseTo(90, 6);
    expect(costUsd("claude-opus-4", { inputTokens: M })).toBeCloseTo(15, 6);
  });

  it("prices Sonnet at $3 / $15 and Haiku 4.5 at $1 / $5 (Haiku 3.5 at $0.80/$4)", () => {
    expect(costUsd("claude-sonnet-4-6", { inputTokens: M, outputTokens: M })).toBeCloseTo(18, 6);
    expect(costUsd("claude-haiku-4-5", { inputTokens: M, outputTokens: M })).toBeCloseTo(6, 6);
    expect(costUsd("claude-haiku-3-5", { inputTokens: M, outputTokens: M })).toBeCloseTo(4.8, 6);
  });

  it("applies cache multipliers (5m 1.25×, 1h 2×, read 0.1× input) for Opus 4.5+", () => {
    // input $5/M → 5m write $6.25, 1h write $10, read $0.50
    expect(costUsd("claude-opus-4-7", { cacheCreation5mTokens: M })).toBeCloseTo(6.25, 6);
    expect(costUsd("claude-opus-4-7", { cacheCreation1hTokens: M })).toBeCloseTo(10, 6);
    expect(costUsd("claude-opus-4-7", { cacheReadTokens: M })).toBeCloseTo(0.5, 6);
  });

  it("falls back to the 5m rate when only a total cache_creation is known", () => {
    expect(costUsd("claude-opus-4-7", { cacheCreationTokens: M })).toBeCloseTo(6.25, 6);
  });

  it("applies fast-mode Opus rates from speed:'fast'", () => {
    // Opus 4.7 fast → $30/$150; Opus 4.8 fast → $10/$50; standard otherwise.
    expect(
      costUsd("claude-opus-4-7", { inputTokens: M, outputTokens: M, speed: "fast" }),
    ).toBeCloseTo(180, 6);
    expect(
      costUsd("claude-opus-4-8", { inputTokens: M, outputTokens: M, speed: "fast" }),
    ).toBeCloseTo(60, 6);
    expect(
      costUsd("claude-opus-4-7", { inputTokens: M, outputTokens: M, speed: "standard" }),
    ).toBeCloseTo(30, 6);
  });

  it("applies the +10% data-residency multiplier for inference_geo:'us'", () => {
    expect(costUsd("claude-opus-4-7", { inputTokens: M, inferenceGeo: "us" })).toBeCloseTo(5.5, 6);
    expect(costUsd("claude-opus-4-7", { inputTokens: M, inferenceGeo: "global" })).toBeCloseTo(
      5,
      6,
    );
  });

  it("returns null for unknown / synthetic models", () => {
    expect(costUsd("<synthetic>", { inputTokens: M })).toBeNull();
    expect(costUsd(undefined, { inputTokens: M })).toBeNull();
  });
});
