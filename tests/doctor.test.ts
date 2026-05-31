import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor.js";
import { localPaths } from "../src/localstate/paths.js";
import { CollectingReporter } from "./helpers/fakes.js";

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
  it("reports ok when hooks + ledger are present", () => {
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
    const lp = localPaths(dir, home);
    mkdirSync(lp.dir, { recursive: true });
    writeFileSync(lp.ledgerDb, "");

    const reporter = new CollectingReporter();
    const result = runDoctor({ repoRoot: dir, reporter, home });
    expect(result.ok).toBe(true);
    expect(reporter.text()).toContain("[ok] agent hooks");
  });

  it("flags missing pieces", () => {
    const reporter = new CollectingReporter();
    const result = runDoctor({ repoRoot: dir, reporter, home });
    expect(result.ok).toBe(false);
    expect(reporter.text()).toContain("MISSING");
  });
});
