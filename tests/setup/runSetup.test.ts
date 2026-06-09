import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeConfig } from "../../src/config/ConfigStore.js";
import { InitError } from "../../src/errors.js";
import { PRE_PUSH_MARKER } from "../../src/git/pushGuard.js";
import { type SetupDeps, runSetup } from "../../src/setup/runSetup.js";
import type { JejakConfig } from "../../src/types.js";
import { CollectingReporter, FakeGitClient } from "../helpers/fakes.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-setup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function deps(): SetupDeps {
  return { git: new FakeGitClient(dir), reporter: new CollectingReporter() };
}
function initialized(mode: JejakConfig["mode"] = "project"): void {
  writeConfig(dir, { v: 1, agent: "claude-code", mode });
}

describe("runSetup", () => {
  it("bare setup (no --claude-code) exits 2", async () => {
    initialized();
    await expect(runSetup({}, deps())).rejects.toMatchObject({ name: "InitError", exitCode: 2 });
  });

  it("fails when not initialized", async () => {
    await expect(runSetup({ claudeCode: true }, deps())).rejects.toBeInstanceOf(InitError);
  });

  it("fails on agent mismatch", async () => {
    writeConfig(dir, { v: 1, agent: "cursor", mode: "project" });
    await expect(runSetup({ claudeCode: true }, deps())).rejects.toBeInstanceOf(InitError);
  });

  it("project mode wires portable npx hooks + an executable git hook", async () => {
    initialized("project");
    await runSetup({ claudeCode: true }, deps());

    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("npx jejak _hook session-start");

    const gitHook = join(dir, ".git/hooks/prepare-commit-msg");
    expect(existsSync(gitHook)).toBe(true);
    expect(readFileSync(gitHook, "utf8")).toContain("exec npx jejak _hook prepare-commit-msg");
    expect(statSync(gitHook).mode & 0o111).toBeTruthy(); // executable
  });

  it("installs an executable pre-push shadow guard", async () => {
    initialized("project");
    const reporter = new CollectingReporter();
    await runSetup({ claudeCode: true }, { git: new FakeGitClient(dir), reporter });

    const prePush = join(dir, ".git/hooks/pre-push");
    expect(existsSync(prePush)).toBe(true);
    expect(readFileSync(prePush, "utf8")).toContain(PRE_PUSH_MARKER);
    expect(statSync(prePush).mode & 0o111).toBeTruthy(); // executable
    expect(reporter.text()).toContain("installed pre-push");
  });

  it("leaves a foreign pre-push hook untouched and warns", async () => {
    initialized("project");
    mkdirSync(join(dir, ".git/hooks"), { recursive: true });
    const prePush = join(dir, ".git/hooks/pre-push");
    writeFileSync(prePush, "#!/bin/sh\necho mine\n");

    const reporter = new CollectingReporter();
    await runSetup({ claudeCode: true }, { git: new FakeGitClient(dir), reporter });

    expect(readFileSync(prePush, "utf8")).toBe("#!/bin/sh\necho mine\n"); // untouched
    expect(reporter.text()).toContain("existing pre-push hook left untouched");
  });

  it("honors core.hooksPath (husky) for both hooks", async () => {
    initialized("project");
    const git = new FakeGitClient(dir, { config: { "core.hooksPath": ".husky" } });
    await runSetup({ claudeCode: true }, { git, reporter: new CollectingReporter() });

    expect(existsSync(join(dir, ".husky/pre-push"))).toBe(true);
    expect(existsSync(join(dir, ".husky/prepare-commit-msg"))).toBe(true);
    expect(existsSync(join(dir, ".git/hooks/pre-push"))).toBe(false); // not the default dir
  });

  it("is idempotent (re-run reports nothing changed)", async () => {
    initialized("project");
    await runSetup({ claudeCode: true }, deps());
    const reporter = new CollectingReporter();
    await runSetup({ claudeCode: true }, { git: new FakeGitClient(dir), reporter });
    expect(reporter.text()).toContain("already present");
  });

  it("refreshes a stale jejak-written pre-push (e.g. after a CLI upgrade)", async () => {
    initialized("project");
    await runSetup({ claudeCode: true }, deps());

    const prePush = join(dir, ".git/hooks/pre-push");
    // simulate an old jejak hook: keeps the marker but stale body
    writeFileSync(prePush, `#!/usr/bin/env bash\n# ${PRE_PUSH_MARKER}\n# stale\nexit 0\n`);
    await runSetup({ claudeCode: true }, deps());

    expect(readFileSync(prePush, "utf8")).not.toContain("# stale"); // rewritten to current
    expect(readFileSync(prePush, "utf8")).toContain(PRE_PUSH_MARKER);
  });
});
