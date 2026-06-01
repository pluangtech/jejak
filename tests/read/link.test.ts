import { describe, expect, it } from "vitest";
import { parseSessionTrailers, runLink } from "../../src/read/link.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

describe("parseSessionTrailers", () => {
  it("extracts every Jejak-Session trailer", () => {
    const body = "feat: thing\n\nbody text\n\nJejak-Session: s1\nJejak-Session: s2\n";
    expect(parseSessionTrailers(body)).toEqual(["s1", "s2"]);
  });
  it("returns [] when there are none", () => {
    expect(parseSessionTrailers("just a message\n")).toEqual([]);
  });
});

describe("runLink", () => {
  it("prints the linked session ids", async () => {
    const git = new FakeGitClient();
    git.bodies.set("deadbeef", "fix\n\nJejak-Session: s1\nJejak-Session: s2\n");
    const reporter = new CollectingReporter();
    await runLink(git, reporter, "deadbeef", {});
    expect(reporter.lines).toEqual(["s1", "s2"]);
  });

  it("--json emits {sha, sessions}", async () => {
    const git = new FakeGitClient();
    git.bodies.set("abc", "x\n\nJejak-Session: s1\n");
    const reporter = new CollectingReporter();
    await runLink(git, reporter, "abc", { json: true });
    expect(JSON.parse(reporter.text())).toEqual({ sha: "abc", sessions: ["s1"] });
  });

  it("friendly message when a commit has no trailers", async () => {
    const reporter = new CollectingReporter();
    await runLink(new FakeGitClient(), reporter, "nocommit", {});
    expect(reporter.text()).toBe("no jejak sessions linked to nocommit");
  });
});
