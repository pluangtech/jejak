import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../src/analytics/aggregate.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { runLog } from "../../src/read/log.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

function meta(id: string, over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    v: 1,
    session_id: id,
    agent: "claude-code",
    dev_handle: "dev",
    status: "captured",
    event_count: 3,
    turn_count: 2,
    started_at: "2026-05-31T09:30:00Z",
    ended_at: "2026-05-31T09:35:00Z",
    duration_ms: 300000,
    models: ["claude-opus-4-8"],
    tokens: { input: 100, output: 200, cache_creation: 50, cache_read: 25 },
    web_tool_use: { search: 0, fetch: 0 },
    cost_usd: 0.1234,
    pricing_version: "2026-06-01",
    ...over,
  };
}

function git(metas: Array<[string, string, SessionMeta]>): FakeGitClient {
  const g = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
  for (const [handle, id, m] of metas) {
    const dir = `sessions/${handle}/${id.slice(0, 2)}/${id}`;
    g.lsTreeFiles.push(`${dir}/meta.json`);
    g.blobs.set(`${SHADOW_REF}:${dir}/meta.json`, Buffer.from(JSON.stringify(m)));
  }
  return g;
}

describe("runLog", () => {
  it("renders a header + one row per session with token/cost columns", async () => {
    const reader = new SessionReader(git([["dev", "s1", meta("s1")]]));
    const reporter = new CollectingReporter();
    await runLog(reader, reporter, {});
    expect(reporter.lines[0]).toContain("SESSION");
    expect(reporter.lines[0]).toContain("COST");
    const row = reporter.lines[1];
    expect(row).toContain("s1");
    expect(row).toContain("100"); // input
    expect(row).toContain("200"); // output
    expect(row).toContain("75"); // cache = 50 + 25
    expect(row).toContain("$0.1234");
    expect(row).toContain("claude-opus-4-8");
  });

  it("default filters to the given handle; --all shows everyone", async () => {
    const g = git([
      ["dev", "s1", meta("s1")],
      ["alice", "a1", meta("a1", { dev_handle: "alice" })],
    ]);
    const mine = new CollectingReporter();
    await runLog(new SessionReader(g), mine, { handleSlug: "dev" });
    expect(mine.text()).toContain("s1");
    expect(mine.text()).not.toContain("a1");

    const all = new CollectingReporter();
    await runLog(new SessionReader(g), all, { all: true, handleSlug: "dev" });
    expect(all.text()).toContain("s1");
    expect(all.text()).toContain("a1");
  });

  it("--json emits valid JSON of the metas", async () => {
    const reporter = new CollectingReporter();
    await runLog(new SessionReader(git([["dev", "s1", meta("s1")]])), reporter, { json: true });
    const parsed = JSON.parse(reporter.text());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].session_id).toBe("s1");
  });

  it("friendly message when empty", async () => {
    const reporter = new CollectingReporter();
    await runLog(new SessionReader(new FakeGitClient()), reporter, {});
    expect(reporter.text()).toBe("no sessions captured yet");
  });

  it("formats a null cost as '-'", async () => {
    const reporter = new CollectingReporter();
    await runLog(
      new SessionReader(git([["dev", "s1", meta("s1", { cost_usd: null })]])),
      reporter,
      {},
    );
    expect(reporter.lines[1]).toContain(" -");
  });
});
