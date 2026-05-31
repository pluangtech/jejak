import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPrepareCommitMsg } from "../../src/hooks/PrepareCommitMsgHandler.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { FakeGitClient } from "../helpers/fakes.js";

let dir: string;
let ledger: SessionLedger;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-pcm-"));
  ledger = new SessionLedger(":memory:");
});
afterEach(() => {
  ledger.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("runPrepareCommitMsg", () => {
  it("stamps one trailer per open session", async () => {
    ledger.openOrResume("a", null, "2026-05-30T00:00:00Z");
    ledger.openOrResume("b", null, "2026-05-30T01:00:00Z");
    const git = new FakeGitClient(dir);
    await runPrepareCommitMsg("/tmp/COMMIT_EDITMSG", { repoRoot: dir, git, ledger });
    expect(git.trailerCalls).toEqual([
      { messageFile: "/tmp/COMMIT_EDITMSG", trailers: ["Jejak-Session: a", "Jejak-Session: b"] },
    ]);
  });

  it("does nothing with no open sessions", async () => {
    const git = new FakeGitClient(dir);
    await runPrepareCommitMsg("/tmp/m", { repoRoot: dir, git, ledger });
    expect(git.trailerCalls).toEqual([]);
  });

  it("does nothing when .jejak/disabled is present", async () => {
    ledger.openOrResume("a", null, "t");
    mkdirSync(join(dir, ".jejak"), { recursive: true });
    writeFileSync(join(dir, ".jejak", "disabled"), "");
    const git = new FakeGitClient(dir);
    await runPrepareCommitMsg("/tmp/m", { repoRoot: dir, git, ledger });
    expect(git.trailerCalls).toEqual([]);
  });
});
