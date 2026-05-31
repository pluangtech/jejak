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
