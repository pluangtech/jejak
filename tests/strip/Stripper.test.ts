import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NARRATIVE_GZIP_RATIO_MAX } from "../../src/strip/constants.js";
import { stripFile, writeJsonl } from "./_util.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-strip-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("stripTranscript", () => {
  it("drops noise lines, keeps user/assistant/summary, and strips blocks", async () => {
    const p = writeJsonl(dir, [
      { type: "summary", summary: "S", uuid: "s1" },
      { type: "agent-setting", uuid: "x" },
      { type: "queue-operation", uuid: "y" },
      { type: "user", uuid: "u1", parentUuid: "s1", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reasoning" },
            { type: "text", text: "answer" },
            { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
          ],
        },
      },
    ]);
    const events = await stripFile(p);
    expect(events.map((e) => e.type)).toEqual(["summary", "user", "assistant"]);
    expect(events[0].content).toEqual([{ type: "text", text: "S" }]);
    expect(events[1]).toMatchObject({
      id: "u1",
      parentId: "s1",
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
    expect(events[2].content[0]).toEqual({ type: "thinking", text: "reasoning" });
    expect(events[2].content[1]).toEqual({ type: "text", text: "answer" });
    expect(events[2].content[2]).toMatchObject({
      type: "tool_use",
      name: "Read",
      input: { path: "a.ts" },
    });
  });

  it("offloads a large tool_result and references it by sha", async () => {
    const p = writeJsonl(dir, [
      {
        type: "user",
        uuid: "u1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: "Q".repeat(5000) }],
        },
      },
    ]);
    const [event] = await stripFile(p);
    const block = event.content[0];
    expect(block.type).toBe("tool_result");
    expect(block.text).toBeUndefined();
    expect(block.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(block.bytes).toBe(5000);
  });

  it("redacts thinking under --strip-thinking", async () => {
    const p = writeJsonl(dir, [
      {
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: [{ type: "thinking", thinking: "secret" }] },
      },
    ]);
    const [event] = await stripFile(p, { stripThinking: true });
    expect(event.content[0]).toEqual({ type: "thinking", text: "[thinking redacted]" });
  });

  it("offloads bulk tool output so the gzipped narrative is a small fraction of raw (thinking kept full)", async () => {
    const thinking = "T".repeat(40_000);
    const objs: unknown[] = [
      {
        type: "assistant",
        uuid: "a1",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking },
            { type: "text", text: "Reading the files." },
            { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
          ],
        },
      },
    ];
    // ~6 MB of tool output across several results — the bulk that must be offloaded.
    for (let i = 0; i < 3; i++) {
      objs.push({
        type: "user",
        uuid: `u${i}`,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: "Z".repeat(2_000_000) }],
        },
      });
    }
    const p = writeJsonl(dir, objs);
    const rawBytes = statSync(p).size;

    const events = await stripFile(p);
    const gzBytes = gzipSync(
      Buffer.from(events.map((e) => JSON.stringify(e)).join("\n"), "utf8"),
    ).byteLength;

    // size tracks conversation length, not tool-output volume
    expect(gzBytes / rawBytes).toBeLessThanOrEqual(NARRATIVE_GZIP_RATIO_MAX);
    // ...while thinking is preserved in full
    const thinkingBlock = events[0].content.find((b) => b.type === "thinking");
    expect(thinkingBlock?.text?.length).toBe(40_000);
  });
});
