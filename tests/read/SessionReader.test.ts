import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../src/analytics/aggregate.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { FakeGitClient } from "../helpers/fakes.js";

function meta(id: string, startedAt: string): SessionMeta {
  return {
    v: 1,
    session_id: id,
    agent: "claude-code",
    dev_handle: "dev",
    status: "captured",
    event_count: 1,
    turn_count: 1,
    started_at: startedAt,
    ended_at: startedAt,
    duration_ms: 0,
    models: ["claude-opus-4-8"],
    tokens: { input: 10, output: 20, cache_creation: 0, cache_read: 0 },
    web_tool_use: { search: 0, fetch: 0 },
    cost_usd: 0.001,
    pricing_version: "2026-06-01",
  };
}

/** Seed a FakeGitClient with two sessions under handle "dev" + one under "alice". */
function seed(): FakeGitClient {
  const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
  const sessions: Array<[string, string, string]> = [
    ["dev", "20s1", "2026-05-30T09:00:00Z"],
    ["dev", "20s2", "2026-05-31T09:00:00Z"],
    ["alice", "30a1", "2026-05-29T09:00:00Z"],
  ];
  for (const [handle, id, started] of sessions) {
    const shard = id.slice(0, 2).toLowerCase();
    const dir = `sessions/${handle}/${shard}/${id}`;
    git.lsTreeFiles.push(`${dir}/meta.json`, `${dir}/events.jsonl.gz`);
    git.blobs.set(`${SHADOW_REF}:${dir}/meta.json`, Buffer.from(JSON.stringify(meta(id, started))));
  }
  return git;
}

describe("SessionReader", () => {
  it("lists every session newest-first and parses handle/id from the path", async () => {
    const entries = await new SessionReader(seed()).list();
    expect(entries.map((e) => e.sessionId)).toEqual(["20s2", "20s1", "30a1"]);
    expect(entries[0]).toMatchObject({ handleSlug: "dev", sessionId: "20s2" });
    expect(entries[0].meta.tokens.input).toBe(10);
  });

  it("filters by handle slug", async () => {
    const entries = await new SessionReader(seed()).list({ handleSlug: "dev" });
    expect(entries.map((e) => e.sessionId)).toEqual(["20s2", "20s1"]);
  });

  it("find matches by session id across handles", async () => {
    const entry = await new SessionReader(seed()).find("30a1");
    expect(entry).toMatchObject({ handleSlug: "alice", sessionId: "30a1" });
    expect(await new SessionReader(seed()).find("nope")).toBeNull();
  });

  it("events gunzips the JSONL stream", async () => {
    const git = seed();
    const jsonl = `${JSON.stringify({ id: "e1", type: "user", text: "hi" })}\n`;
    git.blobs.set(`${SHADOW_REF}:sessions/dev/20/20s1/events.jsonl.gz`, gzipSync(jsonl));
    const events = await new SessionReader(git).events("dev", "20s1");
    expect(events).toEqual([{ id: "e1", type: "user", text: "hi" }]);
  });

  it("payload resolves a content-addressed blob", async () => {
    const git = seed();
    git.blobs.set(`${SHADOW_REF}:payloads/abc123`, Buffer.from("full content"));
    expect((await new SessionReader(git).payload("abc123")).toString()).toBe("full content");
  });

  it("returns [] when the ref has no sessions", async () => {
    expect(await new SessionReader(new FakeGitClient()).list()).toEqual([]);
  });
});
