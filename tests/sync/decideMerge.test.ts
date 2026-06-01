import { describe, expect, it } from "vitest";
import { decideMerge } from "../../src/sync/SyncRepository.js";

describe("decideMerge", () => {
  it("is up to date when we have all their commits (behind = 0)", () => {
    expect(decideMerge(3, 0)).toBe("uptodate");
    expect(decideMerge(0, 0)).toBe("uptodate");
  });

  it("fast-forwards when they strictly extend us (ahead = 0, behind > 0)", () => {
    expect(decideMerge(0, 2)).toBe("fast-forward");
  });

  it("merges when both sides have unique commits", () => {
    expect(decideMerge(1, 1)).toBe("merge");
    expect(decideMerge(5, 3)).toBe("merge");
  });
});
