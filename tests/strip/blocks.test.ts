import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BlockStripper, StripContext } from "../../src/strip/blocks/BlockStripper.js";
import { textBlockStripper } from "../../src/strip/blocks/TextBlockStripper.js";
import { thinkingBlockStripper } from "../../src/strip/blocks/ThinkingBlockStripper.js";
import { toolResultBlockStripper } from "../../src/strip/blocks/ToolResultBlockStripper.js";
import { toolUseBlockStripper } from "../../src/strip/blocks/ToolUseBlockStripper.js";
import { HashingPayloadSink } from "../../src/strip/payload/HashingPayloadSink.js";
import type { StrippedBlock } from "../../src/strip/types.js";

const ctx = (over?: Partial<StripContext>): StripContext => ({
  stripThinking: false,
  sink: new HashingPayloadSink(),
  ...over,
});

const sha256 = (s: string) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

/** Strip a block and assert it wasn't dropped (narrows away the `| null`). */
async function strip(
  s: BlockStripper,
  block: Record<string, unknown>,
  c: StripContext,
): Promise<StrippedBlock> {
  const out = await s.strip(block, c);
  if (!out) throw new Error("block was unexpectedly dropped");
  return out;
}

describe("text block", () => {
  it("passes through", async () => {
    expect(await strip(textBlockStripper, { type: "text", text: "hi" }, ctx())).toEqual({
      type: "text",
      text: "hi",
    });
  });
});

describe("thinking block", () => {
  it("is kept full verbatim even when large (no cap)", async () => {
    const big = "x".repeat(50_000);
    const out = await strip(thinkingBlockStripper, { type: "thinking", thinking: big }, ctx());
    expect(out.text).toBe(big);
    expect(out.text?.length).toBe(50_000);
  });
  it("is redacted under stripThinking", async () => {
    const out = await strip(
      thinkingBlockStripper,
      { type: "thinking", thinking: "secret" },
      ctx({ stripThinking: true }),
    );
    expect(out.text).toBe("[thinking redacted]");
  });
});

describe("tool_use block", () => {
  it("keeps a small input inline", async () => {
    const out = await strip(
      toolUseBlockStripper,
      { type: "tool_use", id: "t1", name: "Read", input: { path: "a.ts" } },
      ctx(),
    );
    expect(out).toMatchObject({
      type: "tool_use",
      name: "Read",
      toolUseId: "t1",
      input: { path: "a.ts" },
    });
    expect(out.sha).toBeUndefined();
  });
  it("offloads a large input", async () => {
    const out = await strip(
      toolUseBlockStripper,
      { type: "tool_use", id: "t1", name: "Write", input: { content: "y".repeat(5000) } },
      ctx(),
    );
    expect(out.input).toBeUndefined();
    expect(out.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(out.preview).toBeDefined();
    expect(out.bytes).toBeGreaterThan(5000);
  });
});

describe("tool_result block", () => {
  it("keeps small content inline", async () => {
    const out = await strip(
      toolResultBlockStripper,
      { type: "tool_result", tool_use_id: "t1", content: "ok" },
      ctx(),
    );
    expect(out).toMatchObject({ type: "tool_result", toolUseId: "t1", text: "ok" });
  });
  it("offloads large content with a head+tail preview and the full-content sha", async () => {
    const body = "A".repeat(600) + "B".repeat(3000) + "Z".repeat(300);
    const out = await strip(
      toolResultBlockStripper,
      { type: "tool_result", tool_use_id: "t1", content: body },
      ctx(),
    );
    expect(out.text).toBeUndefined();
    expect(out.sha).toBe(sha256(body));
    expect(out.bytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(out.preview?.startsWith("A".repeat(512))).toBe(true);
    expect(out.preview?.endsWith("Z".repeat(256))).toBe(true);
    expect(out.preview).toContain("chars elided");
  });
  it("normalizes an array content into text", async () => {
    const out = await strip(
      toolResultBlockStripper,
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: [
          { type: "text", text: "l1" },
          { type: "text", text: "l2" },
        ],
      },
      ctx(),
    );
    expect(out.text).toBe("l1\nl2");
  });
  it("preserves the is_error flag", async () => {
    const out = await strip(
      toolResultBlockStripper,
      { type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true },
      ctx(),
    );
    expect(out.isError).toBe(true);
  });
});
