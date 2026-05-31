import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Reporter } from "./app/AppDeps.js";
import { isDisabled } from "./hooks/disabled.js";
import { localPaths } from "./localstate/paths.js";

export interface DoctorDeps {
  repoRoot: string;
  reporter: Reporter;
  /** Home dir override (tests). */
  home?: string;
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Minimal `jejak doctor` — setup-only checks (item 5). Full diagnostics (sync, dispatch errors,
 * PII gate, `--trace`) land in item 6. Returns `{ ok }` for tests.
 */
export function runDoctor(deps: DoctorDeps): { ok: boolean } {
  const { repoRoot, reporter } = deps;
  const lp = localPaths(repoRoot, deps.home);

  const settingsPath = join(repoRoot, ".claude", "settings.json");
  const agentWired = existsSync(settingsPath) && safeRead(settingsPath).includes("_hook ");
  const gitHookPath = join(repoRoot, ".git", "hooks", "prepare-commit-msg");
  const gitHookWired =
    existsSync(gitHookPath) && safeRead(gitHookPath).includes("_hook prepare-commit-msg");

  const checks: Array<{ name: string; ok: boolean }> = [
    { name: "agent hooks in .claude/settings.json", ok: agentWired },
    { name: "git hook .git/hooks/prepare-commit-msg", ok: gitHookWired },
    { name: "session ledger present", ok: existsSync(lp.ledgerDb) },
  ];
  const stagingCount = existsSync(lp.staging) ? readdirSync(lp.staging).length : 0;

  reporter.line("jejak doctor — setup checks:");
  for (const c of checks) reporter.line(`  [${c.ok ? "ok" : "MISSING"}] ${c.name}`);
  reporter.line(
    `  [info] .jejak/disabled: ${isDisabled(repoRoot) ? "present (capture OFF)" : "absent"}`,
  );
  reporter.line(`  [info] staging sessions: ${stagingCount}`);
  reporter.line("  (sync / PII / capture-health diagnostics: jejak doctor --trace — item 6)");
  reporter.flush();

  return { ok: checks.every((c) => c.ok) };
}
