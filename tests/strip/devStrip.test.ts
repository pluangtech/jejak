import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { devStrip } from "../../src/dev/strip.js";
import { writeJsonl } from "./_util.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-devstrip-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("devStrip", () => {
  it("streams stripped JSONL to the out writer", async () => {
    const p = writeJsonl(dir, [
      { type: "user", uuid: "u1", message: { role: "user", content: "hi" } },
    ]);
    const chunks: string[] = [];
    await devStrip({ path: p }, (s) => chunks.push(s));
    const events = chunks
      .join("")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events[0]).toMatchObject({ id: "u1", type: "user" });
  });

  it("throws on a missing input path", async () => {
    await expect(devStrip({ path: join(dir, "nope.jsonl") }, () => {})).rejects.toThrow(
      /cannot read/,
    );
  });

  it("writes offloaded payloads to --payloads-dir by sha", async () => {
    const body = "Q".repeat(5000);
    const p = writeJsonl(dir, [
      {
        type: "user",
        uuid: "u1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: body }],
        },
      },
    ]);
    const payloadsDir = join(dir, "payloads");
    const chunks: string[] = [];
    await devStrip({ path: p, payloadsDir }, (s) => chunks.push(s));
    const event = JSON.parse(chunks.join("").trim());
    const sha = event.content[0].sha;
    expect(existsSync(join(payloadsDir, sha))).toBe(true);
    expect(readFileSync(join(payloadsDir, sha), "utf8")).toBe(body);
  });

  it("reports a count of skipped malformed lines on the err writer", async () => {
    const p = writeJsonl(dir, [
      { type: "user", uuid: "u1", message: { role: "user", content: "hi" } },
    ]);
    // inject a malformed line
    const { appendFileSync } = await import("node:fs");
    appendFileSync(p, "{ not json\n");
    const errs: string[] = [];
    await devStrip(
      { path: p },
      () => {},
      (s) => errs.push(s),
    );
    expect(errs.join("")).toMatch(/skipped 1 malformed/);
  });
});
