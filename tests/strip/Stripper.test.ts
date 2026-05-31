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
  it("keeps all line types (lossless), strips blocks, and captures analytics metadata", async () => {
    const p = writeJsonl(dir, [
      { type: "summary", summary: "S", uuid: "s1" },
      { type: "agent-setting", uuid: "x", setting: "k" }, // noise lines are NOW kept (lossless)
      { type: "user", uuid: "u1", parentUuid: "s1", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        requestId: "req_1",
        message: {
          role: "assistant",
          model: "claude-opus-4-7",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 5,
            output_tokens: 100,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 0,
            server_tool_use: { web_search_requests: 1 },
          },
          content: [
            { type: "thinking", thinking: "why" },
            { type: "text", text: "answer" },
            { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
          ],
        },
      },
    ]);
    const events = await stripFile(p);

    expect(events.map((e) => e.type)).toEqual(["summary", "agent-setting", "user", "assistant"]);
    expect(events[0].text).toBe("S"); // summary → text
    expect(events[1].meta).toMatchObject({ setting: "k" }); // catch-all preserves unknown fields

    const asst = events.find((e) => e.type === "assistant");
    expect(asst?.model).toBe("claude-opus-4-7");
    expect(asst?.stopReason).toBe("end_turn");
    expect(asst?.requestId).toBe("req_1");
    expect(asst?.usage).toMatchObject({
      inputTokens: 5,
      outputTokens: 100,
      cacheReadTokens: 200,
      webSearchRequests: 1,
    });
    expect(asst?.content?.[0]).toEqual({ type: "thinking", text: "why" });
    expect(asst?.content?.[2]).toMatchObject({ type: "tool_use", name: "Read" });
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
    const block = event.content?.[0];
    expect(block?.type).toBe("tool_result");
    expect(block?.text).toBeUndefined();
    expect(block?.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(block?.bytes).toBe(5000);
  });

  it("offloads a large top-level field (e.g. toolUseResult) via the catch-all", async () => {
    const p = writeJsonl(dir, [
      {
        type: "user",
        uuid: "u1",
        toolUseResult: { stdout: "Z".repeat(5000) },
        message: { role: "user", content: "ran it" },
      },
    ]);
    const [event] = await stripFile(p);
    expect(event.meta?.toolUseResult).toMatchObject({ offloaded: true });
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
    expect(event.content?.[0]).toEqual({ type: "thinking", text: "[thinking redacted]" });
  });

  it("offloads bulk tool output so the gzipped narrative stays a small fraction of raw (thinking kept full)", async () => {
    const thinking = "T".repeat(40_000);
    const objs: unknown[] = [
      {
        type: "assistant",
        uuid: "a1",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking },
            { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
          ],
        },
      },
    ];
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
    expect(gzBytes / rawBytes).toBeLessThanOrEqual(NARRATIVE_GZIP_RATIO_MAX);
    expect(events[0].content?.find((b) => b.type === "thinking")?.text?.length).toBe(40_000);
  });
});
