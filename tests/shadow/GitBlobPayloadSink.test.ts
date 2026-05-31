import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GitBlobPayloadSink } from "../../src/shadow/GitBlobPayloadSink.js";
import { FakeGitClient } from "../helpers/fakes.js";

const sha256 = (s: string) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

describe("GitBlobPayloadSink", () => {
  it("writes a blob and records a payloads/<sha256> tree entry", async () => {
    const git = new FakeGitClient();
    const sink = new GitBlobPayloadSink(git);
    const out = await sink.put("hello-payload");
    expect(out.sha).toBe(sha256("hello-payload"));
    expect(out.bytes).toBe(13);
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]).toMatchObject({
      mode: "100644",
      path: `payloads/${sha256("hello-payload")}`,
    });
    expect(sink.entries[0].sha).toBe("blob1"); // the fake git object id
  });

  it("dedups identical payloads", async () => {
    const sink = new GitBlobPayloadSink(new FakeGitClient());
    await sink.put("same");
    await sink.put("same");
    expect(sink.entries).toHaveLength(1);
  });

  it("references payloads by sha256 — sink-independent of the git object id", async () => {
    // The reference matches HashingPayloadSink's sha (content address), not git's blob oid.
    const sink = new GitBlobPayloadSink(new FakeGitClient());
    const a = await sink.put("abc");
    expect(a.sha).toBe(sha256("abc"));
  });
});
