import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devReadFixture } from "../../src/dev/read_fixture.js";
import { devWriteFixture } from "../../src/dev/write_fixture.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { ShadowRepository } from "../../src/shadow/ShadowRepository.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { stripFile, writeJsonl } from "../strip/_util.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

let dir: string;
const HANDLE = "alice";
const SID = "2026-05-30-sess_test"; // shard "20"
const SESSION_DIR = `sessions/alice/20/${SID}`;

function rawTranscript(d: string): string {
  return writeJsonl(d, [
    { type: "user", uuid: "u1", message: { role: "user", content: "do x" } },
    {
      type: "assistant",
      uuid: "a1",
      parentUuid: "u1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "reasoning here" },
          { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
        ],
      },
    },
    {
      type: "user",
      uuid: "u2",
      parentUuid: "a1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "X".repeat(4000) }],
      },
    },
  ]);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-upsert-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("shadow upsert + round-trip (init Phase B)", () => {
  it("writes a session tree and reads its events back identically; payload offloaded; ref never checked out", async () => {
    const g = new RealGitClient(dir);
    await new ShadowRepository(g).ensure();

    const headBefore = git(dir, ["rev-parse", "HEAD"]);
    const raw = rawTranscript(dir);
    await devWriteFixture(
      { rawPath: raw, handle: HANDLE, sessionId: SID, agent: "claude-code" },
      g,
      () => {},
    );

    // tree layout
    const tree = git(dir, ["ls-tree", "-r", "--name-only", SHADOW_REF]).split("\n");
    expect(tree).toContain(`${SESSION_DIR}/events.jsonl.gz`);
    expect(tree).toContain(`${SESSION_DIR}/meta.json`);
    expect(tree.some((p) => p.startsWith("payloads/"))).toBe(true); // the 4 KB tool_result offloaded

    // round-trip: read-fixture == a direct strip of the same raw (sha refs are sink-independent)
    let out = "";
    await devReadFixture({ handle: HANDLE, sessionId: SID }, g, (s) => {
      out += s;
    });
    const direct = await stripFile(raw);
    expect(
      out
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l)),
    ).toEqual(direct);

    // meta.json
    const meta = JSON.parse(git(dir, ["cat-file", "-p", `${SHADOW_REF}:${SESSION_DIR}/meta.json`]));
    expect(meta).toMatchObject({
      session_id: SID,
      dev_handle: HANDLE,
      agent: "claude-code",
      event_count: direct.length,
    });

    // invariants: working tree stayed on the dev branch; HEAD untouched; capture commit is parented onto the seed
    expect(git(dir, ["branch", "--show-current"])).toBe("main");
    expect(git(dir, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(git(dir, ["rev-list", "--count", SHADOW_REF])).toBe("2"); // seed + capture
  });

  it("is idempotent: re-writing the same session is a no-op (tree-hash dedup, ref unchanged)", async () => {
    const g = new RealGitClient(dir);
    await new ShadowRepository(g).ensure();
    const raw = rawTranscript(dir);

    await devWriteFixture({ rawPath: raw, handle: HANDLE, sessionId: SID }, g, () => {});
    const sha1 = git(dir, ["rev-parse", SHADOW_REF]);
    await devWriteFixture({ rawPath: raw, handle: HANDLE, sessionId: SID }, g, () => {});
    const sha2 = git(dir, ["rev-parse", SHADOW_REF]);

    expect(sha2).toBe(sha1); // identical content → tree-hash dedup short-circuits, no new commit
  });

  it("upsert creates the shadow ref if it doesn't exist yet", async () => {
    const g = new RealGitClient(dir);
    const raw = rawTranscript(dir);
    // no ensure() first — upsert must bootstrap
    await devWriteFixture({ rawPath: raw, handle: HANDLE, sessionId: SID }, g, () => {});
    expect(git(dir, ["show-ref", "--verify", SHADOW_REF])).toContain(SHADOW_REF);
  });
});
