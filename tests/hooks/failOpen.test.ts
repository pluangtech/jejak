import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failOpen } from "../../src/hooks/failOpen.js";

let dir: string;
let logs: string[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-failopen-"));
  logs = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const log = (m: string) => logs.push(m);

describe("failOpen", () => {
  it("runs the handler and logs duration", async () => {
    let ran = false;
    await failOpen({ repoRoot: dir, hook: "stop", sessionId: "s1", log }, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(logs.some((l) => l.includes("duration_ms"))).toBe(true);
  });

  it("skips entirely when .jejak/disabled is present", async () => {
    mkdirSync(join(dir, ".jejak"), { recursive: true });
    writeFileSync(join(dir, ".jejak", "disabled"), "");
    let ran = false;
    await failOpen({ repoRoot: dir, hook: "stop", sessionId: "s1", log }, async () => {
      ran = true;
    });
    expect(ran).toBe(false);
    expect(logs).toEqual([]);
  });

  it("swallows a handler throw (never propagates) and still logs", async () => {
    await expect(
      failOpen({ repoRoot: dir, hook: "stop", sessionId: "s1", log }, async () => {
        throw new Error("boom");
      }),
    ).resolves.toBeUndefined();
    expect(logs.some((l) => l.includes("error"))).toBe(true);
  });

  it("emits one structured JSON line per dispatch (ts/hook/duration; error on failure)", async () => {
    await failOpen({ repoRoot: dir, hook: "stop", sessionId: "s1", log }, async () => {
      throw new Error("boom");
    });
    expect(logs).toHaveLength(1);
    const rec = JSON.parse(logs[0]);
    expect(rec).toMatchObject({ hook: "stop", session_id: "s1", error: "boom" });
    expect(typeof rec.ts).toBe("string");
    expect(typeof rec.duration_ms).toBe("number");
  });
});
