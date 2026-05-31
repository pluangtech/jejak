import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HashingPayloadSink } from "../../src/strip/payload/HashingPayloadSink.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-sink-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("HashingPayloadSink", () => {
  it("is deterministic (same content → same sha + bytes)", async () => {
    const a = await new HashingPayloadSink().put("hello");
    const b = await new HashingPayloadSink().put("hello");
    expect(a).toEqual(b);
    expect(a.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(a.bytes).toBe(5);
  });

  it("writes payloads content-addressed and dedups", async () => {
    const sink = new HashingPayloadSink(dir);
    const { sha } = await sink.put("payload-body");
    await sink.put("payload-body"); // duplicate — no error, single file
    expect(existsSync(join(dir, sha))).toBe(true);
    expect(readFileSync(join(dir, sha), "utf8")).toBe("payload-body");
  });
});
