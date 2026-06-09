import type { Reporter } from "../app/AppDeps.js";
import { readConfig } from "../config/ConfigStore.js";
import { InitError } from "../errors.js";
import type { GitClient } from "../git/GitClient.js";
import { assertNotSelfSetup } from "../guard.js";
import { modeFor } from "../modes/detectMode.js";
import type { AgentId } from "../types.js";
import { ClaudeCodeHookInstaller } from "./ClaudeCodeHookInstaller.js";
import type { HookInstaller } from "./HookInstaller.js";
import { resolveHooksDir } from "./hooksDir.js";
import { resolveCliPath } from "./resolveCli.js";

export interface SetupFlags {
  claudeCode?: boolean;
  force?: boolean;
  iKnowWhatImDoing?: boolean;
}

export interface SetupDeps {
  git: GitClient;
  reporter: Reporter;
  /** Override the global-mode CLI path (tests). */
  resolveCli?: () => string;
  /** Override the installer lookup (tests). */
  installerFor?: (id: AgentId) => HookInstaller | undefined;
}

function defaultInstallerFor(id: AgentId): HookInstaller | undefined {
  return id === "claude-code" ? new ClaudeCodeHookInstaller() : undefined;
}

/** Configure hooks for the repo's chosen agent. Requires `jejak init` to have run. */
export async function runSetup(flags: SetupFlags, deps: SetupDeps): Promise<void> {
  if (!flags.claudeCode) {
    throw new InitError("jejak: pass --claude-code (v0.1 supports only Claude Code)", 2);
  }

  let repoRoot: string;
  try {
    repoRoot = await deps.git.repoRoot();
  } catch {
    throw new InitError("jejak: not a git repository (run `git init` first)");
  }
  assertNotSelfSetup(repoRoot, { iKnowWhatImDoing: flags.iKnowWhatImDoing });

  const config = readConfig(repoRoot);
  if (!config) throw new InitError("jejak: not initialized — run `jejak init` first");
  if (config.agent !== "claude-code") {
    throw new InitError(`jejak: config agent is '${config.agent}', not claude-code`);
  }

  const mode = modeFor(config.mode);
  const resolve = deps.resolveCli ?? resolveCliPath;
  const cli = mode.hookCli(mode.mode === "global" ? resolve() : "");

  const installer = (deps.installerFor ?? defaultInstallerFor)(config.agent);
  if (!installer) throw new InitError(`jejak: no hook installer for '${config.agent}'`);

  const hooksDir = await resolveHooksDir(deps.git, repoRoot);
  const report = await installer.install({ repoRoot, cli, hooksDir, force: Boolean(flags.force) });

  const r = deps.reporter;
  r.line(`jejak: configured ${config.agent} hooks (${mode.mode} mode)`);
  r.line(
    `  agent hooks: ${report.settingsChanged ? "wired into .claude/settings.json" : "already present"}`,
  );
  r.line(`  git hook:    ${report.gitHookWritten ? "installed prepare-commit-msg" : "unchanged"}`);
  r.line(
    `  push guard:  ${report.prePushWritten ? "installed pre-push (blocks accidental trace pushes)" : "unchanged"}`,
  );
  for (const w of report.warnings) r.line(`  warning: ${w}`);
  r.line(
    mode.mode === "project"
      ? "Next: commit .claude/settings.json so teammates inherit hooks via npm install"
      : "Done — capture fires on your next Claude Code session.",
  );
  r.flush();
}
