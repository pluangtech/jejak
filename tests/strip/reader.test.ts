import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCodeJsonlReader } from "../../src/strip/transcript/ClaudeCodeJsonlReader.js";
import type { ReadOptions } from "../../src/strip/transcript/TranscriptReader.js";
import type { RawRecord } from "../../src/strip/types.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-reader-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const reader = new ClaudeCodeJsonlReader();

async function collect(path: string, opts?: ReadOptions): Promise<RawRecord[]> {
  const out: RawRecord[] = [];
  for await (const r of reader.read(path, opts)) out.push(r);
  return out;
}

function write(content: string): string {
  const p = join(dir, "t.jsonl");
  writeFileSync(p, content);
  return p;
}

describe("ClaudeCodeJsonlReader", () => {
  it("parses lines and reports the byte offset after each", async () => {
    const l1 = JSON.stringify({ type: "user", uuid: "u1" });
    const l2 = JSON.stringify({ type: "assistant", uuid: "a1" });
    const recs = await collect(write(`${l1}\n${l2}\n`));
    expect(recs.map((r) => r.lineType)).toEqual(["user", "assistant"]);
    expect(recs[0].offset).toBe(Buffer.byteLength(l1, "utf8") + 1);
    expect(recs[1].offset).toBe(
      Buffer.byteLength(l1, "utf8") + 1 + Buffer.byteLength(l2, "utf8") + 1,
    );
  });

  it("resumes from a byte offset and emits no earlier ids", async () => {
    const l1 = JSON.stringify({ type: "user", uuid: "u1" });
    const l2 = JSON.stringify({ type: "assistant", uuid: "a1" });
    const recs = await collect(write(`${l1}\n${l2}\n`), {
      fromOffset: Buffer.byteLength(l1, "utf8") + 1,
    });
    expect(recs.map((r) => r.raw.uuid)).toEqual(["a1"]);
  });

  it("skips a malformed line mid-file and continues", async () => {
    const content = `${JSON.stringify({ type: "user", uuid: "u1" })}\n{ not json\n${JSON.stringify({ type: "assistant", uuid: "a1" })}\n`;
    let skipped = 0;
    const recs = await collect(write(content), {
      onSkippedLine: () => {
        skipped += 1;
      },
    });
    expect(recs.map((r) => r.raw.uuid)).toEqual(["u1", "a1"]);
    expect(skipped).toBe(1);
  });

  it("keeps a valid final line with no trailing newline", async () => {
    const recs = await collect(write(JSON.stringify({ type: "user", uuid: "u1" })));
    expect(recs.map((r) => r.raw.uuid)).toEqual(["u1"]);
  });
});
