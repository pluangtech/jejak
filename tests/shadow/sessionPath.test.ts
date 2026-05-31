import { describe, expect, it } from "vitest";
import { sessionPath, shardFor } from "../../src/shadow/sessionPath.js";

describe("sessionPath", () => {
  it("shards on the first two chars (lowercased)", () => {
    expect(shardFor("2026-05-30-sess_01H")).toBe("20");
    expect(shardFor("ABcd")).toBe("ab");
  });

  it("builds sessions/<handle>/<shard>/<id>", () => {
    expect(sessionPath("alice", "2026-05-30-x")).toBe("sessions/alice/20/2026-05-30-x");
  });

  it("slugifies the handle", () => {
    expect(sessionPath("Aditya Jha", "ABcd")).toBe("sessions/aditya-jha/ab/ABcd");
  });
});
