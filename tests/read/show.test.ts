import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../src/analytics/aggregate.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { ShowError, runShow } from "../../src/read/show.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import type { StrippedEvent } from "../../src/strip/types.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

const META: SessionMeta = {
  v: 1,
  session_id: "s1",
  agent: "claude-code",
  dev_handle: "dev",
  status: "captured",
  event_count: 2,
  turn_count: 1,
  started_at: "2026-05-31T09:30:00Z",
  ended_at: "2026-05-31T09:35:00Z",
  duration_ms: 0,
  models: ["claude-opus-4-8"],
  tokens: { input: 1, output: 2, cache_creation: 0, cache_read: 0 },
  web_tool_use: { search: 0, fetch: 0 },
  cost_usd: 0.01,
  pricing_version: "2026-06-01",
};

function seed(events: StrippedEvent[]): FakeGitClient {
  const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
  // sessions/<handle>/<shard>/<id>; shard of "s1" is "s1"
  const path = "sessions/dev/s1/s1";
  git.lsTreeFiles.push(`${path}/meta.json`);
  git.blobs.set(`${SHADOW_REF}:${path}/meta.json`, Buffer.from(JSON.stringify(META)));
  const jsonl = events.map((e) => `${JSON.stringify(e)}\n`).join("");
  git.blobs.set(`${SHADOW_REF}:${path}/events.jsonl.gz`, gzipSync(jsonl));
  return git;
}

describe("runShow", () => {
  it("renders the session header and each event", async () => {
    const git = seed([
      { id: "e1", type: "user", role: "user", text: "hello" },
      {
        id: "e2",
        type: "assistant",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [{ type: "text", text: "hi there" }],
      },
    ]);
    const reporter = new CollectingReporter();
    await runShow(new SessionReader(git), reporter, "s1", {});
    const out = reporter.text();
    expect(out).toContain("session s1");
    expect(out).toContain("hello");
    expect(out).toContain("hi there");
    expect(out).toContain("claude-opus-4-8");
  });

  it("shows a preview + sha for offloaded blocks; --expand resolves the payload", async () => {
    const git = seed([
      {
        id: "e1",
        type: "assistant",
        content: [{ type: "tool_result", preview: "head…tail", sha: "abc123def456", bytes: 9000 }],
      },
    ]);
    git.blobs.set(`${SHADOW_REF}:payloads/abc123def456`, Buffer.from("THE FULL PAYLOAD"));

    const collapsed = new CollectingReporter();
    await runShow(new SessionReader(git), collapsed, "s1", {});
    expect(collapsed.text()).toContain("head…tail");
    expect(collapsed.text()).toContain("9000 bytes");
    expect(collapsed.text()).not.toContain("THE FULL PAYLOAD");

    const expanded = new CollectingReporter();
    await runShow(new SessionReader(git), expanded, "s1", { expand: true });
    expect(expanded.text()).toContain("THE FULL PAYLOAD");
  });

  it("--json dumps the raw events", async () => {
    const git = seed([{ id: "e1", type: "user", text: "hi" }]);
    const reporter = new CollectingReporter();
    await runShow(new SessionReader(git), reporter, "s1", { json: true });
    expect(JSON.parse(reporter.text())).toEqual([{ id: "e1", type: "user", text: "hi" }]);
  });

  it("throws ShowError for an unknown session id", async () => {
    await expect(
      runShow(new SessionReader(new FakeGitClient()), new CollectingReporter(), "nope", {}),
    ).rejects.toBeInstanceOf(ShowError);
  });
});
