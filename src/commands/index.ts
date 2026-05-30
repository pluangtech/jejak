import type { CommandModule } from "./CommandModule.js";
import { initCommand } from "./init.command.js";
import { type StubSpec, makeStubCommand } from "./stubCommand.js";

/** Not-yet-implemented verbs. Graduating one = move it to its own *.command.ts and drop it here. */
const STUB_SPECS: StubSpec[] = [
  {
    name: "setup",
    description: "Configure hooks for a supported agent",
    item: 5,
    lldSection: "§9",
    configure: (c) =>
      c
        .option("--claude-code", "Configure Claude Code hooks (v0.1)")
        .option("--force", "Re-write hook scripts after CLI upgrade"),
  },
  { name: "status", description: "Local vs origin trace branch state", item: 6, lldSection: "§16" },
  {
    name: "active-session-id",
    description: "List open capture session IDs",
    item: 5,
    lldSection: "§11",
  },
  { name: "log", description: "List captured sessions", item: 6, lldSection: "§16" },
  {
    name: "show",
    description: "Show a captured session trace",
    item: 6,
    lldSection: "§16",
    configure: (c) => c.argument("[session-id]", "Session ID"),
  },
  {
    name: "link",
    description: "Link a git commit to session(s)",
    item: 6,
    lldSection: "§16",
    configure: (c) => c.argument("<sha>", "Commit SHA"),
  },
  { name: "push", description: "Push trace branch to origin", item: 6, lldSection: "§16" },
  { name: "fetch", description: "Fetch and merge traces from origin", item: 6, lldSection: "§16" },
  {
    name: "attach",
    description: "Recover a missed capture into the shadow branch",
    item: 6,
    lldSection: "§16",
  },
  {
    name: "doctor",
    description: "Diagnostics for setup, sync, and capture health",
    item: 6,
    lldSection: "§16",
    configure: (c) => c.option("--trace", "Verbose diagnostic trace"),
  },
  {
    name: "uninstall",
    description: "Remove hooks; optional local state purge",
    item: 6,
    lldSection: "§16",
    configure: (c) => c.option("--purge", "Remove ~/.jejak/<repo-hash>/ state"),
  },
];

/** The public command registry, in display order (init first). */
export const PUBLIC_COMMANDS: CommandModule[] = [initCommand, ...STUB_SPECS.map(makeStubCommand)];

/** Public verb names — must match scripts/expected-verbs.json (verb-coverage test). */
export const PUBLIC_COMMAND_NAMES: string[] = PUBLIC_COMMANDS.map((c) => c.name);
