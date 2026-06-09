import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRE_PUSH_MARKER, renderPrePushGuard } from "../git/pushGuard.js";
import type { AgentId } from "../types.js";
import type { HookInstaller, InstallContext, InstallReport } from "./HookInstaller.js";
import { type ClaudeSettings, mergeSettings } from "./settingsMerge.js";

const SETTINGS_PATH = ".claude/settings.json";
/** Marker that identifies a jejak-written prepare-commit-msg hook (refresh ours, never clobber foreign). */
const PREPARE_COMMIT_MARKER = "_hook prepare-commit-msg";

/** Result of writing one managed git hook. */
interface HookWrite {
  written: boolean;
  warning?: string;
}

export class ClaudeCodeHookInstaller implements HookInstaller {
  readonly agentId: AgentId = "claude-code";

  async install(ctx: InstallContext): Promise<InstallReport> {
    const warnings: string[] = [];
    const settingsChanged = this.mergeAgentHooks(ctx);

    const prepare = this.writeManagedHook(ctx, {
      name: "prepare-commit-msg",
      marker: PREPARE_COMMIT_MARKER,
      body: `#!/usr/bin/env bash\nexec ${ctx.cli} _hook prepare-commit-msg "$@"\n`,
      manualFix: `add 'exec ${ctx.cli} _hook prepare-commit-msg "$@"' manually`,
    });
    if (prepare.warning) warnings.push(prepare.warning);

    const prePush = this.writeManagedHook(ctx, {
      name: "pre-push",
      marker: PRE_PUSH_MARKER,
      body: renderPrePushGuard(),
      manualFix: "add jejak's pre-push guard manually to keep the trace ref off accidental pushes",
    });
    if (prePush.warning) warnings.push(prePush.warning);

    return {
      settingsChanged,
      gitHookWritten: prepare.written,
      prePushWritten: prePush.written,
      warnings,
    };
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

  /**
   * Write one git hook under the resolved hooks dir — refresh ours, never clobber a foreign one.
   * A hook is "ours" if it carries `marker`; a foreign hook is left untouched with a warning.
   */
  private writeManagedHook(
    ctx: InstallContext,
    hook: { name: string; marker: string; body: string; manualFix: string },
  ): HookWrite {
    const path = join(ctx.hooksDir, hook.name);
    if (existsSync(path)) {
      const current = readFileSync(path, "utf8");
      if (!current.includes(hook.marker)) {
        return {
          written: false,
          warning: `existing ${hook.name} hook left untouched (not jejak's) — ${hook.manualFix}`,
        };
      }
      if (!ctx.force && current === hook.body) return { written: false }; // already current
    }
    mkdirSync(ctx.hooksDir, { recursive: true });
    writeFileSync(path, hook.body, "utf8");
    chmodSync(path, 0o755);
    return { written: true };
  }
}
