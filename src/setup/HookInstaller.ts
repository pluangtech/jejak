import type { AgentId } from "../types.js";

export interface InstallContext {
  repoRoot: string;
  /** Mode-resolved CLI invocation embedded into hooks (e.g. `npx jejak` or `'/abs/jejak'`). */
  cli: string;
  /** Directory git reads hooks from (honors `core.hooksPath`; see {@link resolveHooksDir}). */
  hooksDir: string;
  /** Overwrite a previously jejak-written git hook (e.g. after a CLI upgrade). */
  force: boolean;
}

export interface InstallReport {
  settingsChanged: boolean;
  gitHookWritten: boolean;
  /** True if the `pre-push` shadow-ref guard was (re)written. */
  prePushWritten: boolean;
  /** Non-fatal issues (e.g. a foreign git hook left untouched). */
  warnings: string[];
}

/** Wires one agent's hooks. Cursor/Codex add a new installer later; setup orchestration is unchanged. */
export interface HookInstaller {
  readonly agentId: AgentId;
  install(ctx: InstallContext): Promise<InstallReport>;
}
