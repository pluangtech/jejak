import { describe, expect, it } from "vitest";
import { parseDispatchLog, percentile, summarizeDispatch } from "../../src/doctor/dispatch.js";

describe("parseDispatchLog", () => {
  it("parses JSON lines and skips malformed / legacy lines", () => {
    const log = [
      '{"ts":"2026-05-31T10:00:00Z","hook":"stop","session_id":"s1","duration_ms":12}',
      "stop error (s1): legacy freeform line",
      "",
      '{"hook":"session-start","duration_ms":4}',
      "{not json}",
    ].join("\n");
    const recs = parseDispatchLog(log);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ hook: "stop", duration_ms: 12 });
  });
});

describe("percentile", () => {
  it("uses nearest-rank and handles edges", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 50)).toBe(5);
    expect(percentile(s, 95)).toBe(10);
    expect(percentile(s, 99)).toBe(10);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("summarizeDispatch", () => {
  const NOW = Date.parse("2026-05-31T12:00:00Z");

  it("counts errors within the 7-day window and ignores older ones", () => {
    const recs = parseDispatchLog(
      [
        `{"ts":"2026-05-31T11:00:00Z","hook":"stop","duration_ms":5,"error":"boom"}`, // recent
        `{"ts":"2026-05-01T11:00:00Z","hook":"stop","duration_ms":5,"error":"old"}`, // >7d
        `{"ts":"2026-05-31T11:30:00Z","hook":"stop","duration_ms":5}`, // no error
      ].join("\n"),
    );
    expect(summarizeDispatch(recs, { nowMs: NOW }).errorCount).toBe(1);
  });

  it("computes per-hook percentiles sorted by hook name", () => {
    const recs = parseDispatchLog(
      [10, 20, 30, 40]
        .map((d) => `{"ts":"2026-05-31T11:00:00Z","hook":"stop","duration_ms":${d}}`)
        .concat(`{"ts":"2026-05-31T11:00:00Z","hook":"session-start","duration_ms":3}`)
        .join("\n"),
    );
    const { timings } = summarizeDispatch(recs, { nowMs: NOW });
    expect(timings.map((t) => t.hook)).toEqual(["session-start", "stop"]);
    const stop = timings.find((t) => t.hook === "stop");
    expect(stop).toMatchObject({ count: 4, p50: 20, p95: 40, p99: 40 });
  });
});
