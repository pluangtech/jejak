import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StagingStore } from "../../src/capture/StagingStore.js";
import type { WorkerSpawner } from "../../src/capture/WorkerSpawner.js";
import type { CaptureContext } from "../../src/hooks/CaptureContext.js";
import { handleSessionEnd } from "../../src/hooks/SessionEndHandler.js";
import { handleSessionStart } from "../../src/hooks/SessionStartHandler.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { NoopPiiScanner } from "../../src/pii/PiiScanner.js";
import { ShadowRepository } from "../../src/shadow/ShadowRepository.js";
import { FakeGitClient } from "../helpers/fakes.js";

let home: string;
let ledger: SessionLedger;
function ctx(spawnCalls: Array<{ id: string; final?: boolean }>): CaptureContext {
  const git = new FakeGitClient("/repo", { config: { "user.name": "Dev" } });
  const spawner: WorkerSpawner = {
    spawn: (id, opts) => spawnCalls.push({ id, final: opts?.final }),
  };
  return {
    repoRoot: "/repo",
    git,
    ledger,
    staging: new StagingStore("/repo", home),
    scanner: new NoopPiiScanner(),
    shadow: new ShadowRepository(git),
    spawner,
    now: () => "2026-05-31T00:00:00Z",
    log: () => {},
    home,
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "jejak-handlers-"));
  ledger = new SessionLedger(":memory:");
});
afterEach(() => {
  ledger.close();
  rmSync(home, { recursive: true, force: true });
});

describe("handleSessionStart", () => {
  it("opens the session in the ledger", async () => {
    await handleSessionStart({ sessionId: "s1", transcriptPath: "/t.jsonl" }, ctx([]));
    expect(ledger.get("s1")?.status).toBe("open");
    expect(ledger.get("s1")?.transcript_path).toBe("/t.jsonl");
  });
});

describe("handleSessionEnd", () => {
  it("spawns the detached final worker (returns immediately)", async () => {
    const spawnCalls: Array<{ id: string; final?: boolean }> = [];
    await handleSessionEnd({ sessionId: "s1" }, ctx(spawnCalls));
    expect(spawnCalls).toEqual([{ id: "s1", final: true }]);
  });
});
