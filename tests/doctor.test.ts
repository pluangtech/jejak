import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor.js";
import { renderPrePushGuard } from "../src/git/pushGuard.js";
import { localPaths } from "../src/localstate/paths.js";
import { CollectingReporter, FakeGitClient } from "./helpers/fakes.js";

let dir: string;
let home: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-doc-repo-"));
  home = mkdtempSync(join(tmpdir(), "jejak-doc-home-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("runDoctor (minimal)", () => {
  it("reports ok when hooks + ledger are present", async () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude/settings.json"),
      '{"hooks":{"Stop":[{"hooks":[{"command":"npx jejak _hook stop"}]}]}}',
    );
    mkdirSync(join(dir, ".git/hooks"), { recursive: true });
    writeFileSync(
      join(dir, ".git/hooks/prepare-commit-msg"),
      'exec npx jejak _hook prepare-commit-msg "$@"',
    );
    writeFileSync(join(dir, ".git/hooks/pre-push"), renderPrePushGuard());
    const lp = localPaths(dir, home);
    mkdirSync(lp.dir, { recursive: true });
    writeFileSync(lp.ledgerDb, "");

    const reporter = new CollectingReporter();
    const result = await runDoctor({ repoRoot: dir, reporter, home });
    expect(result.ok).toBe(true);
    expect(reporter.text()).toContain("[ok] agent hooks");
    expect(reporter.text()).toContain("[ok] pre-push shadow guard");
  });

  it("flags missing pieces", async () => {
    const reporter = new CollectingReporter();
    const result = await runDoctor({ repoRoot: dir, reporter, home });
    expect(result.ok).toBe(false);
    expect(reporter.text()).toContain("MISSING");
  });

  it("flags a missing pre-push guard with a remediation warning", async () => {
    const reporter = new CollectingReporter();
    await runDoctor({ repoRoot: dir, reporter, home });
    expect(reporter.text()).toContain("[MISSING] pre-push shadow guard");
    expect(reporter.text()).toContain("NOT protected from accidental `git push`");
  });

  it("warns on push.default=matching", async () => {
    const git = new FakeGitClient(dir, { config: { "push.default": "matching" } });
    const reporter = new CollectingReporter();
    await runDoctor({ repoRoot: dir, reporter, git, home });
    expect(reporter.text()).toContain("push.default=matching");
  });

  it("does not warn when push.default is safe", async () => {
    const git = new FakeGitClient(dir, { config: { "push.default": "simple" } });
    const reporter = new CollectingReporter();
    await runDoctor({ repoRoot: dir, reporter, git, home });
    expect(reporter.text()).not.toContain("push.default=matching");
  });
});
