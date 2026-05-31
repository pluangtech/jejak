import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnapshotWorker, type SnapshotWorkerDeps } from "../../src/capture/SnapshotWorker.js";
import { StagingStore } from "../../src/capture/StagingStore.js";
import { SessionLedger } from "../../src/ledger/SessionLedger.js";
import { NoopPiiScanner, type PiiScanner } from "../../src/pii/PiiScanner.js";
import { ShadowRepository } from "../../src/shadow/ShadowRepository.js";
import { FakeGitClient } from "../helpers/fakes.js";
import { writeJsonl } from "../strip/_util.js";

let home: string;
let dir: string;
let git: FakeGitClient;
let ledger: SessionLedger;
let staging: StagingStore;
let fixture: string;

function makeDeps(scanner: PiiScanner = new NoopPiiScanner()): SnapshotWorkerDeps {
  return {
    git,
    ledger,
    staging,
    scanner,
    shadow: new ShadowRepository(git),
    now: () => "2026-05-31T00:00:00Z",
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "jejak-sw-home-"));
  dir = mkdtempSync(join(tmpdir(), "jejak-sw-fix-"));
  git = new FakeGitClient("/repo", { config: { "user.name": "Dev" } });
  ledger = new SessionLedger(":memory:");
  staging = new StagingStore("/repo", home);
  fixture = writeJsonl(dir, [
    { type: "user", uuid: "u1", message: { role: "user", content: "hi" } },
    {
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "why" },
          { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
        ],
      },
    },
    {
      type: "user",
      uuid: "u2",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: "X".repeat(5000) }],
      },
    },
  ]);
  ledger.openOrResume("s1", fixture, "t");
});
afterEach(() => {
  ledger.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

describe("SnapshotWorker", () => {
  it("strips, stages, upserts, and advances the offset", async () => {
    await new SnapshotWorker(makeDeps()).run("s1");
    const row = ledger.get("s1");
    expect(row?.last_offset).toBeGreaterThan(0);
    expect(row?.event_count).toBe(3);
    expect(staging.eventCount("s1")).toBe(3);
    expect(git.commits.length).toBeGreaterThan(0); // upsert wrote to the (fake) shadow ref
  });

  it("resumes: a second run from EOF adds nothing", async () => {
    const worker = new SnapshotWorker(makeDeps());
    await worker.run("s1");
    const { last_offset: off, event_count: cnt } = ledger.get("s1") ?? {};
    await worker.run("s1");
    expect(ledger.get("s1")?.last_offset).toBe(off);
    expect(ledger.get("s1")?.event_count).toBe(cnt);
  });

  it("final: marks captured, back-fills commit_sha, clears staging", async () => {
    git.commitForTrailer = "abc123";
    await new SnapshotWorker(makeDeps()).run("s1", { final: true });
    const row = ledger.get("s1");
    expect(row?.status).toBe("captured");
    expect(row?.commit_sha).toBe("abc123");
    expect(staging.read("s1")).toBe("");
  });

  it("blocked scanner: advances offset, marks captured-with-blocks, does not write the ref", async () => {
    const blocking: PiiScanner = { scan: () => ({ blocked: true, scrubbed: "" }) };
    await new SnapshotWorker(makeDeps(blocking)).run("s1", { final: true });
    const row = ledger.get("s1");
    expect(row?.status).toBe("captured-with-blocks");
    expect(row?.last_offset).toBeGreaterThan(0);
    expect(git.commits.length).toBe(0); // nothing written to the shared ref
  });
});
