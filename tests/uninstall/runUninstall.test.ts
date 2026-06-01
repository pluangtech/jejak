import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPaths } from "../../src/localstate/paths.js";
import { removeJejakHooks } from "../../src/setup/settingsMerge.js";
import { runUninstall } from "../../src/uninstall/runUninstall.js";
import { CollectingReporter, FakeGitClient, FakePrompter } from "../helpers/fakes.js";

describe("removeJejakHooks", () => {
  it("drops only jejak entries and keeps foreign hooks in the same event", () => {
    const settings = {
      hooks: {
        Stop: [
          { matcher: "", hooks: [{ type: "command", command: "npx jejak _hook stop" }] },
          { matcher: "", hooks: [{ type: "command", command: "my-own-linter" }] },
        ],
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: "npx jejak _hook session-start" }] },
        ],
      },
    };
    const { settings: out, changed } = removeJejakHooks(settings);
    expect(changed).toBe(true);
    expect(out.hooks?.Stop).toEqual([
      { matcher: "", hooks: [{ type: "command", command: "my-own-linter" }] },
    ]);
    expect(out.hooks?.SessionStart).toBeUndefined(); // pruned (became empty)
  });

  it("is a no-op when there are no jejak hooks", () => {
    expect(removeJejakHooks({ hooks: { Stop: [] } }).changed).toBe(false);
    expect(removeJejakHooks(null).changed).toBe(false);
  });
});

describe("runUninstall", () => {
  let dir: string;
  let home: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jejak-uninst-"));
    home = mkdtempSync(join(tmpdir(), "jejak-uninst-home-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function deps(confirm = true) {
    const git = new FakeGitClient(dir);
    return {
      git,
      prompter: new FakePrompter({ confirm }),
      reporter: new CollectingReporter(),
      home,
    };
  }

  it("removes jejak agent hooks (foreign preserved) and our git hook", async () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude/settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            { matcher: "", hooks: [{ type: "command", command: "npx jejak _hook stop" }] },
            { matcher: "", hooks: [{ type: "command", command: "keep-me" }] },
          ],
        },
      }),
    );
    mkdirSync(join(dir, ".git/hooks"), { recursive: true });
    writeFileSync(
      join(dir, ".git/hooks/prepare-commit-msg"),
      'exec npx jejak _hook prepare-commit-msg "$@"',
    );

    const d = deps();
    await runUninstall({}, d);

    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.Stop).toEqual([
      { matcher: "", hooks: [{ type: "command", command: "keep-me" }] },
    ]);
    expect(existsSync(join(dir, ".git/hooks/prepare-commit-msg"))).toBe(false);
  });

  it("leaves a foreign git hook untouched", async () => {
    mkdirSync(join(dir, ".git/hooks"), { recursive: true });
    const hook = join(dir, ".git/hooks/prepare-commit-msg");
    writeFileSync(hook, "#!/bin/sh\necho not jejak");
    await runUninstall({}, deps());
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, "utf8")).toContain("not jejak");
  });

  it("--purge removes local state when confirmed, keeps it when declined", async () => {
    const lp = localPaths(dir, home);
    mkdirSync(lp.dir, { recursive: true });
    writeFileSync(lp.ledgerDb, "");

    await runUninstall({ purge: true }, deps(false)); // declined
    expect(existsSync(lp.dir)).toBe(true);

    await runUninstall({ purge: true }, deps(true)); // confirmed
    expect(existsSync(lp.dir)).toBe(false);
  });
});
