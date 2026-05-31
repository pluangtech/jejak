import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeConfig } from "../../src/config/ConfigStore.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { runPrepareCommitMsg } from "../../src/hooks/PrepareCommitMsgHandler.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { runSetup } from "../../src/setup/runSetup.js";
import { CollectingReporter } from "../helpers/fakes.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

let dir: string;
let root: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-setupit-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  root = git(dir, ["rev-parse", "--show-toplevel"]);
  writeConfig(root, { v: 1, agent: "claude-code", mode: "project" });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("jejak setup (integration)", () => {
  it("wires .claude/settings.json + an executable prepare-commit-msg git hook", async () => {
    await runSetup(
      { claudeCode: true },
      { git: new RealGitClient(root), reporter: new CollectingReporter() },
    );

    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("npx jejak _hook session-start");

    const hook = join(root, ".git/hooks/prepare-commit-msg");
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, "utf8")).toContain("exec npx jejak _hook prepare-commit-msg");
    expect(statSync(hook).mode & 0o111).toBeTruthy();
  });

  it("refuses self-setup in the jejak repo", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "jejak" }));
    await expect(
      runSetup(
        { claudeCode: true },
        { git: new RealGitClient(root), reporter: new CollectingReporter() },
      ),
    ).rejects.toMatchObject({ name: "InitError" });
  });

  it("prepare-commit-msg stamps a real Jejak-Session trailer via git interpret-trailers", async () => {
    const ledger = new SessionLedger(":memory:");
    ledger.openOrResume("2026-05-30-s1", null, "2026-05-30T00:00:00Z");
    const msg = join(root, "COMMIT_EDITMSG");
    writeFileSync(msg, "feat: a thing\n");

    await runPrepareCommitMsg(msg, { repoRoot: root, git: new RealGitClient(root), ledger });

    expect(readFileSync(msg, "utf8")).toContain("Jejak-Session: 2026-05-30-s1");
    ledger.close();
  });
});
