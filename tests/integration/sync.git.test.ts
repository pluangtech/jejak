import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devWriteFixture } from "../../src/dev/write_fixture.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { ShadowRepository } from "../../src/shadow/ShadowRepository.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { SyncRepository } from "../../src/sync/SyncRepository.js";
import { writeJsonl } from "../strip/_util.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** A minimal repo wired to the shared bare remote (never checks out the shadow ref). */
function makeRepo(prefix: string, remote: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  git(dir, ["remote", "add", "origin", remote]);
  return dir;
}

async function capture(dir: string, handle: string, sessionId: string): Promise<void> {
  const g = new RealGitClient(dir);
  await new ShadowRepository(g).ensure();
  const raw = writeJsonl(
    dir,
    [{ type: "user", uuid: "u1", message: { role: "user", content: `work by ${handle}` } }],
    `${sessionId}.jsonl`,
  );
  await devWriteFixture({ rawPath: raw, handle, sessionId }, g, () => {});
}

let remote: string;
let repoA: string;
let repoB: string;

beforeEach(() => {
  remote = mkdtempSync(join(tmpdir(), "jejak-remote-"));
  git(remote, ["init", "--bare", "-q"]);
  repoA = makeRepo("jejak-syncA-", remote);
  repoB = makeRepo("jejak-syncB-", remote);
});
afterEach(() => {
  for (const d of [remote, repoA, repoB]) rmSync(d, { recursive: true, force: true });
});

async function sessionIds(dir: string): Promise<string[]> {
  const entries = await new SessionReader(new RealGitClient(dir)).list();
  return entries.map((e) => e.sessionId).sort();
}

describe("sync push/fetch (integration)", () => {
  it("push then fetch round-trips a session to a second repo", async () => {
    await capture(repoA, "alice", "2026-05-30-a1");
    const pushed = await new SyncRepository(new RealGitClient(repoA)).push();
    expect(pushed.pushed).toBe(true);

    // bare remote now carries the shadow ref
    expect(git(remote, ["show-ref", "--verify", SHADOW_REF])).toContain(SHADOW_REF);

    // repo B (never captured) adopts it on first fetch
    const fetched = await new SyncRepository(new RealGitClient(repoB)).fetch();
    expect(fetched.action).toBe("adopt");
    expect(await sessionIds(repoB)).toEqual(["2026-05-30-a1"]);
  });

  it("merges concurrent writes from two handles conflict-free (nothing dropped)", async () => {
    // A captures + pushes first.
    await capture(repoA, "alice", "2026-05-30-a1");
    await new SyncRepository(new RealGitClient(repoA)).push();

    // B fetches A's work, captures its own, pushes (fast-forward — no divergence yet).
    await new SyncRepository(new RealGitClient(repoB)).fetch();
    await capture(repoB, "bob", "2026-05-30-b1");
    await new SyncRepository(new RealGitClient(repoB)).push();

    // A captures a second session WITHOUT fetching → its push is rejected → auto fetch+merge+retry.
    await capture(repoA, "alice", "2026-05-31-a2");
    const pushed = await new SyncRepository(new RealGitClient(repoA)).push();
    expect(pushed.pushed).toBe(true);
    expect(pushed.attempts).toBeGreaterThan(1); // proves the retry path ran

    // After everyone syncs, both repos hold all three sessions — disjoint partitions merged.
    await new SyncRepository(new RealGitClient(repoB)).fetch();
    const all = ["2026-05-30-a1", "2026-05-30-b1", "2026-05-31-a2"];
    expect(await sessionIds(repoA)).toEqual(all);
    expect(await sessionIds(repoB)).toEqual(all);

    // Invariant: neither repo ever left main.
    expect(git(repoA, ["branch", "--show-current"])).toBe("main");
    expect(git(repoB, ["branch", "--show-current"])).toBe("main");
  });
});
