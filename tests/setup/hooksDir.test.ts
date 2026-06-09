import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHooksDir } from "../../src/setup/hooksDir.js";
import { FakeGitClient } from "../helpers/fakes.js";

describe("resolveHooksDir", () => {
  const root = "/repo";

  it("defaults to <repoRoot>/.git/hooks when core.hooksPath is unset", async () => {
    const git = new FakeGitClient(root);
    expect(await resolveHooksDir(git, root)).toBe(join(root, ".git", "hooks"));
  });

  it("joins a relative core.hooksPath to the repo root (husky)", async () => {
    const git = new FakeGitClient(root, { config: { "core.hooksPath": ".husky" } });
    expect(await resolveHooksDir(git, root)).toBe(join(root, ".husky"));
  });

  it("uses an absolute core.hooksPath as-is", async () => {
    const git = new FakeGitClient(root, { config: { "core.hooksPath": "/etc/githooks" } });
    expect(await resolveHooksDir(git, root)).toBe("/etc/githooks");
  });
});
