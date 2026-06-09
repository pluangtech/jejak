import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RealGitClient } from "../../src/git/GitClient.js";
import { PUSH_GUARD_ENV, renderPrePushGuard } from "../../src/git/pushGuard.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";

/** Run `git <args>` in cwd; never throws — returns the exit status and combined output. */
function git(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): { ok: boolean; out: string } {
  try {
    const out = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function installGuard(hooksDir: string): void {
  mkdirSync(hooksDir, { recursive: true });
  const path = join(hooksDir, "pre-push");
  writeFileSync(path, renderPrePushGuard());
  chmodSync(path, 0o755);
}

let dir: string;
let work: string;
let origin: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-guard-"));
  origin = join(dir, "origin.git");
  work = join(dir, "work");
  execFileSync("git", ["init", "-q", "--bare", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  git(work, ["config", "user.name", "Dev"]);
  git(work, ["config", "user.email", "dev@example.com"]);
  writeFileSync(join(work, "a.txt"), "hi\n");
  git(work, ["add", "a.txt"]);
  git(work, ["commit", "-qm", "init"]);
  git(work, ["remote", "add", "origin", origin]);
  // local shadow ref, as jejak's bootstrap would create it
  git(work, ["update-ref", SHADOW_REF, "HEAD"]);
  installGuard(join(work, ".git", "hooks"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const BLOCK_MSG = "refusing to push the trace shadow ref";

describe("pre-push shadow guard (integration)", () => {
  it("allows a normal branch push (no shadow ref in the set)", () => {
    const r = git(work, ["push", "origin", "main"]);
    expect(r.ok).toBe(true);
  });

  it("blocks git push --all", () => {
    const r = git(work, ["push", "--all", "origin"]);
    expect(r.ok).toBe(false);
    expect(r.out).toContain(BLOCK_MSG);
  });

  it("blocks git push --mirror", () => {
    const r = git(work, ["push", "--mirror", "origin"]);
    expect(r.ok).toBe(false);
    expect(r.out).toContain(BLOCK_MSG);
  });

  it("blocks an explicit shadow-ref push", () => {
    const r = git(work, ["push", "origin", SHADOW_REF]);
    expect(r.ok).toBe(false);
    expect(r.out).toContain(BLOCK_MSG);
  });

  it("blocks a shadow-ref delete (ref name only in the remote-ref column)", () => {
    // seed origin with the ref first, via the handshake
    expect(git(work, ["push", "origin", SHADOW_REF], { [PUSH_GUARD_ENV]: "1" }).ok).toBe(true);
    const r = git(work, ["push", "origin", `:${SHADOW_REF}`]);
    expect(r.ok).toBe(false);
    expect(r.out).toContain(BLOCK_MSG);
  });

  it("allows the deliberate override (handshake env var)", () => {
    const r = git(work, ["push", "--all", "origin"], { [PUSH_GUARD_ENV]: "1" });
    expect(r.ok).toBe(true);
  });

  it("fires when installed under core.hooksPath (husky-style)", () => {
    // move the guard out of .git/hooks into a custom dir and point git at it
    rmSync(join(work, ".git", "hooks", "pre-push"));
    const custom = join(work, ".husky");
    installGuard(custom);
    git(work, ["config", "core.hooksPath", custom]);

    const r = git(work, ["push", "--all", "origin"]);
    expect(r.ok).toBe(false);
    expect(r.out).toContain(BLOCK_MSG);
  });

  it("RealGitClient.push succeeds through the guard (handshake reaches the hook)", async () => {
    const pushed = await new RealGitClient(work).push("origin", SHADOW_REF);
    expect(pushed).toBe(true);
    // the ref really landed on origin
    const ls = git(work, ["ls-remote", "origin", SHADOW_REF]);
    expect(ls.out).toContain(SHADOW_REF);
  });
});
