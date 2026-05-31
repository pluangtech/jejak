import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentId } from "../types.js";
import type { HookInstaller, InstallContext, InstallReport } from "./HookInstaller.js";
import { type ClaudeSettings, mergeSettings } from "./settingsMerge.js";

const SETTINGS_PATH = ".claude/settings.json";
const GIT_HOOK_PATH = ".git/hooks/prepare-commit-msg";
/** Marker that identifies a jejak-written git hook (so we refresh ours but never clobber a foreign one). */
const GIT_HOOK_MARKER = "_hook prepare-commit-msg";

export class ClaudeCodeHookInstaller implements HookInstaller {
  readonly agentId: AgentId = "claude-code";

  async install(ctx: InstallContext): Promise<InstallReport> {
    const warnings: string[] = [];
    const settingsChanged = this.mergeAgentHooks(ctx);
    const gitHookWritten = this.installGitHook(ctx, warnings);
    return { settingsChanged, gitHookWritten, warnings };
  }

  /** Additive merge into .claude/settings.json (never clobbers foreign hooks). */
  private mergeAgentHooks(ctx: InstallContext): boolean {
    const path = join(ctx.repoRoot, SETTINGS_PATH);
    let existing: ClaudeSettings | null = null;
    if (existsSync(path)) {
      try {
        existing = JSON.parse(readFileSync(path, "utf8")) as ClaudeSettings;
      } catch {
        existing = null; // unparseable → start fresh rather than throw (we still won't lose data we can't read; warn)
      }
    }
    const { settings, changed } = mergeSettings(existing, ctx.cli);
    if (changed) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    }
    return changed;
  }

  /** Write the prepare-commit-msg git hook — refresh ours, never clobber a foreign one. */
  private installGitHook(ctx: InstallContext, warnings: string[]): boolean {
    const path = join(ctx.repoRoot, GIT_HOOK_PATH);
    if (existsSync(path)) {
      const current = readFileSync(path, "utf8");
      const isOurs = current.includes(GIT_HOOK_MARKER);
      if (!isOurs) {
        warnings.push(
          `existing ${GIT_HOOK_PATH} left untouched (not jejak's) — add 'exec ${ctx.cli} _hook prepare-commit-msg "$@"' manually`,
        );
        return false;
      }
      if (!ctx.force && current.includes(ctx.cli)) return false; // already current
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `#!/usr/bin/env bash\nexec ${ctx.cli} _hook prepare-commit-msg "$@"\n`,
      "utf8",
    );
    chmodSync(path, 0o755);
    return true;
  }
}
