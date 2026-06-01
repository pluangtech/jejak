import type { CommandModule } from "./CommandModule.js";
import { activeSessionIdCommand } from "./active-session-id.command.js";
import { doctorCommand } from "./doctor.command.js";
import { initCommand } from "./init.command.js";
import { linkCommand } from "./link.command.js";
import { logCommand } from "./log.command.js";
import { setupCommand } from "./setup.command.js";
import { showCommand } from "./show.command.js";
import { statusCommand } from "./status.command.js";
import { type StubSpec, makeStubCommand } from "./stubCommand.js";

/** Not-yet-implemented verbs. Graduating one = move it to its own *.command.ts and drop it here. */
const STUB_SPECS: StubSpec[] = [
  { name: "push", description: "Push trace branch to origin", item: 6, lldSection: "§16" },
  { name: "fetch", description: "Fetch and merge traces from origin", item: 6, lldSection: "§16" },
  {
    name: "attach",
    description: "Recover a missed capture into the shadow branch",
    item: 6,
    lldSection: "§16",
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
export const PUBLIC_COMMANDS: CommandModule[] = [
  initCommand,
  setupCommand,
  statusCommand,
  activeSessionIdCommand,
  logCommand,
  showCommand,
  linkCommand,
  doctorCommand,
  ...STUB_SPECS.map(makeStubCommand),
];

/** Public verb names — must match scripts/expected-verbs.json (verb-coverage test). */
export const PUBLIC_COMMAND_NAMES: string[] = PUBLIC_COMMANDS.map((c) => c.name);
