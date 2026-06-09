import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter } from "../app/AppDeps.js";
import { InitError } from "../errors.js";
import type { GitClient } from "../git/GitClient.js";
import { PRE_PUSH_MARKER } from "../git/pushGuard.js";
import { localPaths } from "../localstate/paths.js";
import type { Prompter } from "../prompt/Prompter.js";
import { resolveHooksDir } from "../setup/hooksDir.js";
import { type ClaudeSettings, removeJejakHooks } from "../setup/settingsMerge.js";

const SETTINGS_PATH = ".claude/settings.json";
const PREPARE_COMMIT_MARKER = "_hook prepare-commit-msg";

export interface UninstallFlags {
  purge?: boolean;
}

export interface UninstallDeps {
  git: GitClient;
  prompter: Prompter;
  reporter: Reporter;
  /** Home dir override (tests). */
  home?: string;
}

/**
 * `jejak uninstall` — inverse of `jejak setup` (DESIGN-LLD §16.3). Removes jejak's agent-hook entries
 * (keeping foreign hooks) and its git hook (only if ours), and with `--purge` deletes this repo's
 * `~/.jejak/<hash>/` local state. The shadow ref is never touched — re-running `setup` restores cleanly.
 */
export async function runUninstall(flags: UninstallFlags, deps: UninstallDeps): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await deps.git.repoRoot();
  } catch {
    throw new InitError("jejak: not a git repository");
  }

  const r = deps.reporter;
  const hooksDir = await resolveHooksDir(deps.git, repoRoot);
  r.line("jejak: uninstalling");
  r.line(`  agent hooks: ${removeAgentHooks(repoRoot)}`);
  r.line(
    `  git hook:    ${removeManagedHook(hooksDir, "prepare-commit-msg", PREPARE_COMMIT_MARKER)}`,
  );
  r.line(`  push guard:  ${removeManagedHook(hooksDir, "pre-push", PRE_PUSH_MARKER)}`);

  if (flags.purge) {
    const dir = localPaths(repoRoot, deps.home).dir;
    if (existsSync(dir)) {
      const ok = await deps.prompter.confirm(
        "Delete local jejak state (ledger, staging, dispatch log) for this repo?",
        false,
      );
      if (ok) {
        rmSync(dir, { recursive: true, force: true });
        r.line(`  local state: removed ${dir}`);
      } else {
        r.line("  local state: kept (purge declined)");
      }
    } else {
      r.line("  local state: nothing to purge");
    }
  }

  r.line("  shadow ref: preserved (re-run `jejak setup` to restore hooks)");
  r.flush();
}

/** Strip jejak's hook entries from .claude/settings.json; returns a human status line. */
function removeAgentHooks(repoRoot: string): string {
  const path = join(repoRoot, SETTINGS_PATH);
  if (!existsSync(path)) return "not found";
  let existing: ClaudeSettings | null;
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
  } catch {
    return "left untouched (unparseable settings.json)";
  }
  const { settings, changed } = removeJejakHooks(existing);
  if (!changed) return "none present";
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return "removed from .claude/settings.json (foreign hooks preserved)";
}

/** Delete a managed git hook only if it carries jejak's marker; returns a human status line. */
function removeManagedHook(hooksDir: string, name: string, marker: string): string {
  const path = join(hooksDir, name);
  if (!existsSync(path)) return "not found";
  if (!readFileSync(path, "utf8").includes(marker)) {
    return "left untouched (foreign hook)";
  }
  unlinkSync(path);
  return `removed ${name}`;
}
