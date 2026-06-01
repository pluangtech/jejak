import { describe, expect, it } from "vitest";
import { linkHeadToSession } from "../../src/attach/runAttach.js";
import { CollectingReporter, FakeGitClient, FakePrompter } from "../helpers/fakes.js";

const SID = "2026-05-31-sx";

function deps(git: FakeGitClient, confirm = true) {
  return { git, prompter: new FakePrompter({ confirm }), reporter: new CollectingReporter() };
}

describe("linkHeadToSession (three branches)", () => {
  it("appends to a HEAD that already carries a jejak trailer (no prompt)", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: ["HEAD"] });
    git.bodies.set("commit1", "feat: x\n\nJejak-Session: other-session");
    const prompter = new FakePrompter({ confirm: false }); // would refuse if asked
    const result = await linkHeadToSession(
      { git, prompter, reporter: new CollectingReporter() },
      SID,
      {},
    );
    expect(result.action).toBe("appended");
    expect(git.amendedMessages).toHaveLength(1);
    expect(git.amendedMessages[0]).toContain(`Jejak-Session: ${SID}`);
    expect(prompter.calls).toHaveLength(0); // never prompted
  });

  it("prompts before amending a HEAD with no jejak trailer; declining leaves it unlinked", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: ["HEAD"] });
    git.bodies.set("commit1", "feat: plain commit");
    const result = await linkHeadToSession(deps(git, false), SID, {});
    expect(result).toEqual({ action: "unlinked", commitSha: null });
    expect(git.amendedMessages).toHaveLength(0);
  });

  it("--force amends a bare HEAD without prompting", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: ["HEAD"] });
    git.bodies.set("commit1", "feat: plain commit");
    const result = await linkHeadToSession(deps(git, false), SID, { force: true });
    expect(result.action).toBe("amended");
    expect(git.amendedMessages[0]).toContain(`Jejak-Session: ${SID}`);
  });

  it("is a no-op when HEAD already links this session", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: ["HEAD"] });
    git.bodies.set("commit1", `feat: x\n\nJejak-Session: ${SID}`);
    const result = await linkHeadToSession(deps(git), SID, {});
    expect(result).toEqual({ action: "already", commitSha: "commit1" });
    expect(git.amendedMessages).toHaveLength(0);
  });

  it("stays unlinked on a detached HEAD", async () => {
    const git = new FakeGitClient("/repo", { existingRefs: ["HEAD"] });
    git.detached = true;
    const result = await linkHeadToSession(deps(git), SID, {});
    expect(result).toEqual({ action: "unlinked", commitSha: null });
  });

  it("stays unlinked when HEAD is unborn", async () => {
    const git = new FakeGitClient("/repo"); // HEAD does not resolve
    const result = await linkHeadToSession(deps(git), SID, {});
    expect(result).toEqual({ action: "unlinked", commitSha: null });
  });
});
