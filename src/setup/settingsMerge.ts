/** Claude Code `.claude/settings.json` hook shapes (only the parts jejak touches). */
interface HookCommand {
  type: string;
  command: string;
}
interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}
export interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/** Claude Code event → jejak `_hook` subcommand. */
export const AGENT_EVENTS: ReadonlyArray<readonly [event: string, sub: string]> = [
  ["SessionStart", "session-start"],
  ["Stop", "stop"],
  ["SessionEnd", "session-end"],
];

/**
 * Additively merge jejak's agent hooks into existing settings — **never clobbers**. Foreign hooks
 * are preserved; jejak's entry is added once per event (idempotent re-runs). `cli` is the
 * mode-resolved invocation (e.g. `npx jejak`).
 */
export function mergeSettings(
  existing: ClaudeSettings | null,
  cli: string,
): { settings: ClaudeSettings; changed: boolean } {
  const settings: ClaudeSettings = existing ?? {};
  settings.hooks ??= {};
  const hooks = settings.hooks;
  let changed = false;

  for (const [event, sub] of AGENT_EVENTS) {
    hooks[event] ??= [];
    const entries = hooks[event];
    const alreadyWired = entries.some((e) =>
      e.hooks?.some((h) => typeof h.command === "string" && h.command.includes(`_hook ${sub}`)),
    );
    if (!alreadyWired) {
      entries.push({ matcher: "", hooks: [{ type: "command", command: `${cli} _hook ${sub}` }] });
      changed = true;
    }
  }
  return { settings, changed };
}

/** True if a hook entry was written by jejak (its command invokes `_hook <sub>`). */
function isJejakEntry(entry: HookEntry, sub: string): boolean {
  return Boolean(
    entry.hooks?.some((h) => typeof h.command === "string" && h.command.includes(`_hook ${sub}`)),
  );
}

/**
 * Inverse of {@link mergeSettings}: drop only jejak's agent-hook entries (matched by the `_hook
 * <sub>` marker), preserving every foreign hook. Prunes event arrays that become empty. Used by
 * `jejak uninstall`.
 */
export function removeJejakHooks(existing: ClaudeSettings | null): {
  settings: ClaudeSettings;
  changed: boolean;
} {
  const settings: ClaudeSettings = existing ?? {};
  const hooks = settings.hooks;
  if (!hooks) return { settings, changed: false };
  let changed = false;

  for (const [event, sub] of AGENT_EVENTS) {
    const entries = hooks[event];
    if (!entries) continue;
    const kept = entries.filter((e) => !isJejakEntry(e, sub));
    if (kept.length !== entries.length) changed = true;
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  return { settings, changed };
}
