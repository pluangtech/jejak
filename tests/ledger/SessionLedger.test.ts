import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";

let ledger: SessionLedger;
beforeEach(() => {
  ledger = new SessionLedger(":memory:");
});
afterEach(() => ledger.close());

describe("SessionLedger", () => {
  it("opens a new session and resumes an existing one", () => {
    expect(ledger.openOrResume("s1", "/t.jsonl", "2026-05-30T00:00:00Z")).toEqual({
      resumed: false,
    });
    expect(ledger.get("s1")?.status).toBe("open");
    ledger.setStatus("s1", "captured");
    expect(ledger.openOrResume("s1", null, "2026-05-30T01:00:00Z")).toEqual({ resumed: true });
    expect(ledger.get("s1")?.status).toBe("open"); // captured → open on resume
  });

  it("advances the offset and event count", () => {
    ledger.openOrResume("s1", "/t.jsonl", "t");
    ledger.advanceOffset("s1", 4096, 12);
    const row = ledger.get("s1");
    expect(row?.last_offset).toBe(4096);
    expect(row?.event_count).toBe(12);
  });

  it("lists open sessions oldest-first and the most recent", () => {
    ledger.openOrResume("a", null, "2026-05-30T00:00:00Z");
    ledger.openOrResume("b", null, "2026-05-30T01:00:00Z");
    ledger.openOrResume("c", null, "2026-05-30T02:00:00Z");
    ledger.setStatus("b", "captured");
    expect(ledger.listOpen()).toEqual(["a", "c"]);
    expect(ledger.mostRecentOpen()).toBe("c");
  });

  it("setStatus back-fills commit_sha", () => {
    ledger.openOrResume("s1", null, "t");
    ledger.setStatus("s1", "captured", { commitSha: "def456", branch: "main", endedAt: "t2" });
    const row = ledger.get("s1");
    expect(row).toMatchObject({
      status: "captured",
      commit_sha: "def456",
      branch: "main",
      ended_at: "t2",
    });
  });
});
