import { describe, expect, it } from "vitest";
import { parseHookPayload } from "../../src/hooks/payload.js";

describe("parseHookPayload", () => {
  it("normalizes a Claude hook payload", () => {
    const raw = JSON.stringify({
      session_id: "2026-05-30-s1",
      transcript_path: "/t.jsonl",
      cwd: "/repo",
      source: "startup",
      hook_event_name: "SessionStart",
    });
    expect(parseHookPayload(raw)).toEqual({
      sessionId: "2026-05-30-s1",
      transcriptPath: "/t.jsonl",
      cwd: "/repo",
      source: "startup",
    });
  });

  it("returns null for junk or a missing session id", () => {
    expect(parseHookPayload("not json")).toBeNull();
    expect(parseHookPayload("{}")).toBeNull();
    expect(parseHookPayload(JSON.stringify({ cwd: "/x" }))).toBeNull();
  });
});
