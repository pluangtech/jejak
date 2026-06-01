import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devWriteFixture } from "../../src/dev/write_fixture.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { runLink } from "../../src/read/link.js";
import { runLog } from "../../src/read/log.js";
import { runShow } from "../../src/read/show.js";
import { runStatus } from "../../src/read/status.js";
import { CollectingReporter } from "../helpers/fakes.js";
import { writeJsonl } from "../strip/_util.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

let dir: string;
const HANDLE = "alice";
const SID = "2026-05-30-read_test"; // shard "20"

function rawTranscript(d: string): string {
  return writeJsonl(d, [
    { type: "user", uuid: "u1", message: { role: "user", content: "do x" } },
    {
      type: "assistant",
      uuid: "a1",
      parentUuid: "u1",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } }],
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
  dir = mkdtempSync(join(tmpdir(), "jejak-read-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("read CLI (integration)", () => {
  it("log lists the session; show renders + --expand resolves a payload; link + status work", async () => {
    const g = new RealGitClient(dir);
    const raw = rawTranscript(dir);
    await devWriteFixture({ rawPath: raw, handle: HANDLE, sessionId: SID }, g, () => {});

    const reader = new SessionReader(g);

    // log
    const logOut = new CollectingReporter();
    await runLog(reader, logOut, {});
    expect(logOut.text()).toContain(SID);
    expect(logOut.text()).toContain("SESSION");

    // show: the 4 KB tool_result is offloaded → collapsed shows a sha ref, --expand inlines it
    const collapsed = new CollectingReporter();
    await runShow(reader, collapsed, SID, {});
    expect(collapsed.text()).toContain(SID);
    expect(collapsed.text()).toMatch(/bytes>/);

    const expanded = new CollectingReporter();
    await runShow(reader, expanded, SID, { expand: true });
    expect(expanded.text()).toContain("X".repeat(50)); // full payload inlined

    // link: a commit carrying the trailer is traced back to the session
    git(dir, ["commit", "-q", "--allow-empty", "-m", `feat: thing\n\nJejak-Session: ${SID}`]);
    const sha = git(dir, ["rev-parse", "HEAD"]);
    const linkOut = new CollectingReporter();
    await runLink(g, linkOut, sha, {});
    expect(linkOut.lines).toContain(SID);

    // status: initialized, one session, not pushed
    const statusOut = new CollectingReporter();
    await runStatus(g, reader, statusOut, {});
    expect(statusOut.text()).toContain("sessions captured: 1");
    expect(statusOut.text()).toContain("not pushed yet");

    // read-only: working tree stayed on main
    expect(git(dir, ["branch", "--show-current"])).toBe("main");
  });
});
