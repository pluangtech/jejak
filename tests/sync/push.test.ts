import { describe, expect, it } from "vitest";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { SyncRepository } from "../../src/sync/SyncRepository.js";
import { PushBlockedError, runPush } from "../../src/sync/push.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

describe("runPush — PII hard-gate", () => {
  it("refuses and never calls git.push when the catalog failed to load", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
    await expect(
      runPush(new SyncRepository(git), new CollectingReporter(), { catalogOk: false }),
    ).rejects.toBeInstanceOf(PushBlockedError);
    expect(git.pushCalls).toHaveLength(0);
  });

  it("pushes when the catalog is ok", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
    const reporter = new CollectingReporter();
    await runPush(new SyncRepository(git), reporter, { catalogOk: true });
    expect(git.pushCalls).toHaveLength(1);
    expect(reporter.text()).toContain("pushed shadow ref to origin");
  });

  it("reports nothing to push when there is no local ref", async () => {
    const git = new FakeGitClient(); // no shadow ref
    const reporter = new CollectingReporter();
    await runPush(new SyncRepository(git), reporter, { catalogOk: true });
    expect(git.pushCalls).toHaveLength(0);
    expect(reporter.text()).toContain("nothing to push");
  });
});

describe("SyncRepository.push — retry on rejection", () => {
  it("re-fetches and retries after a non-fast-forward rejection, then succeeds", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: [SHADOW_REF] });
    git.pushResults = [false, true]; // first push rejected, second accepted
    git.fetchReturns = null; // origin has nothing new to merge on the retry

    const result = await new SyncRepository(git).push();
    expect(result).toEqual({ pushed: true, attempts: 2 });
    expect(git.pushCalls).toHaveLength(2);
    expect(git.fetchCalls).toHaveLength(1); // one re-fetch between the two pushes
  });
});
