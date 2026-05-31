import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeConfig } from "../../src/config/ConfigStore.js";
import { InitError } from "../../src/errors.js";
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

  it("is idempotent (re-run reports nothing changed)", async () => {
    initialized("project");
    await runSetup({ claudeCode: true }, deps());
    const reporter = new CollectingReporter();
    await runSetup({ claudeCode: true }, { git: new FakeGitClient(dir), reporter });
    expect(reporter.text()).toContain("already present");
  });
});
