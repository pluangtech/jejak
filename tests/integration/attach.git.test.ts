import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAttach } from "../../src/attach/runAttach.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { localPaths } from "../../src/localstate/paths.js";
import { SessionReader } from "../../src/read/SessionReader.js";
import { runLink } from "../../src/read/link.js";
import { CollectingReporter, FakePrompter } from "../helpers/fakes.js";
import { writeJsonl } from "../strip/_util.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const SID = "2026-05-30-attach1"; // shard "20"
let dir: string;
let home: string;
let origHome: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-attach-"));
  home = mkdtempSync(join(tmpdir(), "jejak-attach-home-"));
  origHome = process.env.HOME;
  process.env.HOME = home; // createCaptureContext resolves localPaths via os.homedir() ($HOME on POSIX)
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "feat: plain commit"]);
});
afterEach(() => {
  process.env.HOME = origHome;
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("attach (integration)", () => {
  it("captures an open session and links HEAD via an amended trailer", async () => {
    // git resolves symlinks (/var → /private/var on macOS), so use the canonical root the
    // capture context will compute, not the raw mkdtemp path.
    const repoRoot = git(dir, ["rev-parse", "--show-toplevel"]);

    // Seed an open session in the ledger pointing at a real transcript (hooks 'missed' the finalize).
    const transcript = writeJsonl(dir, [
      { type: "user", uuid: "u1", message: { role: "user", content: "do the thing" } },
    ]);
    const ledger = new SessionLedger(localPaths(repoRoot).ledgerDb);
    ledger.openOrResume(SID, transcript, "2026-05-30T10:00:00Z");
    ledger.close();

    const g = new RealGitClient(dir);
    const reporter = new CollectingReporter();
    await runAttach({ git: g, prompter: new FakePrompter({ confirm: true }), reporter }, SID, {
      force: true,
    });

    // session landed on the shadow ref
    const sessions = (await new SessionReader(g).list()).map((e) => e.sessionId);
    expect(sessions).toContain(SID);

    // HEAD was amended with the trailer; link finds it
    const linkOut = new CollectingReporter();
    await runLink(g, linkOut, "HEAD", {});
    expect(linkOut.lines).toContain(SID);

    // ledger finalized + linked; working tree untouched
    const finalized = new SessionLedger(localPaths(repoRoot).ledgerDb);
    const row = finalized.get(SID);
    finalized.close();
    expect(row?.status).toMatch(/captured/);
    expect(row?.commit_sha).toBe(git(dir, ["rev-parse", "HEAD"]));
    expect(git(dir, ["branch", "--show-current"])).toBe("main");
  });
});
