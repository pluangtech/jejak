import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StagingStore } from "../../src/capture/StagingStore.js";
import { captureSnapshot } from "../../src/capture/captureSnapshot.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import type { CaptureContext } from "../../src/hooks/CaptureContext.js";
import { handleSessionStart } from "../../src/hooks/SessionStartHandler.js";
import { handleStop } from "../../src/hooks/StopHandler.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { localPaths } from "../../src/localstate/paths.js";
import { NoopPiiScanner } from "../../src/pii/PiiScanner.js";
import { ShadowRepository } from "../../src/shadow/ShadowRepository.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { sessionPath } from "../../src/shadow/sessionPath.js";
import { stripFile, writeJsonl } from "../strip/_util.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

let dir: string;
let root: string;
let home: string;
let ledger: SessionLedger;
const SID = "2026-05-30-cap"; // shard "20"

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-cap-"));
  home = mkdtempSync(join(tmpdir(), "jejak-cap-home-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Dev"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  root = git(dir, ["rev-parse", "--show-toplevel"]);
  ledger = new SessionLedger(localPaths(root, home).ledgerDb);
});
afterEach(() => {
  ledger.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function makeCtx(): CaptureContext {
  const gitClient = new RealGitClient(root);
  return {
    repoRoot: root,
    git: gitClient,
    ledger,
    staging: new StagingStore(root, home),
    scanner: new NoopPiiScanner(),
    shadow: new ShadowRepository(gitClient),
    spawner: { spawn: () => {} },
    now: () => "2026-05-31T00:00:00Z",
    log: () => {},
    home,
  };
}

describe("capture loop (integration)", () => {
  it("session-start → stop → final lands the session on the shadow ref, read-back identical, work tree untouched", async () => {
    const fixture = writeJsonl(dir, [
      { type: "user", uuid: "u1", message: { role: "user", content: "do x" } },
      {
        type: "assistant",
        uuid: "a1",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reason" },
            { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
          ],
        },
      },
      {
        type: "user",
        uuid: "u2",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: "X".repeat(4000) }],
        },
      },
    ]);
    const ctx = makeCtx();
    const headBefore = git(dir, ["rev-parse", "HEAD"]);

    await handleSessionStart({ sessionId: SID, transcriptPath: fixture }, ctx);
    expect(ledger.get(SID)?.status).toBe("open");

    await handleStop({ sessionId: SID }, ctx); // per-turn snapshot
    await captureSnapshot(SID, ctx, { final: true }); // what the detached SessionEnd worker does

    // session blob on the shadow ref; read-back == a direct strip of the transcript
    const path = `${sessionPath("dev", SID)}/events.jsonl.gz`;
    const gz = await ctx.git.catBlob(`${SHADOW_REF}:${path}`);
    const readBack = gunzipSync(gz)
      .toString("utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(readBack).toEqual(await stripFile(fixture));

    // ledger captured; staging cleaned; working tree never moved off the dev branch
    expect(ledger.get(SID)?.status).toBe("captured");
    expect(new StagingStore(root, home).read(SID)).toBe("");
    expect(git(dir, ["branch", "--show-current"])).toBe("main");
    expect(git(dir, ["rev-parse", "HEAD"])).toBe(headBefore);
  });
});
