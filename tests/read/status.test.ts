import { describe, expect, it } from "vitest";
import { SessionReader } from "../../src/read/SessionReader.js";
import { runStatus } from "../../src/read/status.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

const ORIGIN_REF = "refs/remotes/origin/jejak/sessions/v1";

describe("runStatus", () => {
  it("reports not-initialized when the shadow ref is absent", async () => {
    const git = new FakeGitClient();
    const reporter = new CollectingReporter();
    await runStatus(git, new SessionReader(git), reporter, {});
    expect(reporter.text()).toContain("not initialized");
  });

  it("reports session count and 'not pushed yet' without an origin ref", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
    git.lsTreeFiles.push("sessions/dev/s1/s1/meta.json");
    git.blobs.set(
      `${SHADOW_REF}:sessions/dev/s1/s1/meta.json`,
      Buffer.from(JSON.stringify({ session_id: "s1", started_at: "2026-05-31T00:00:00Z" })),
    );
    const reporter = new CollectingReporter();
    await runStatus(git, new SessionReader(git), reporter, {});
    expect(reporter.text()).toContain("sessions captured: 1");
    expect(reporter.text()).toContain("not pushed yet");
  });

  it("reports ahead/behind when an origin tracking ref exists", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF, ORIGIN_REF] });
    git.revCounts.set(`${ORIGIN_REF}..${SHADOW_REF}`, 3);
    git.revCounts.set(`${SHADOW_REF}..${ORIGIN_REF}`, 1);
    const reporter = new CollectingReporter();
    await runStatus(git, new SessionReader(git), reporter, {});
    expect(reporter.text()).toContain("3 ahead, 1 behind");
  });

  it("--json reports the structured state", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
    const reporter = new CollectingReporter();
    await runStatus(git, new SessionReader(git), reporter, { json: true });
    expect(JSON.parse(reporter.text())).toMatchObject({
      initialized: true,
      pushed: false,
      sessions: 0,
    });
  });
});
