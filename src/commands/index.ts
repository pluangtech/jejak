import type { CommandModule } from "./CommandModule.js";
import { activeSessionIdCommand } from "./active-session-id.command.js";
import { attachCommand } from "./attach.command.js";
import { doctorCommand } from "./doctor.command.js";
import { fetchCommand } from "./fetch.command.js";
import { initCommand } from "./init.command.js";
import { linkCommand } from "./link.command.js";
import { logCommand } from "./log.command.js";
import { pushCommand } from "./push.command.js";
import { setupCommand } from "./setup.command.js";
import { showCommand } from "./show.command.js";
import { statusCommand } from "./status.command.js";
import { uninstallCommand } from "./uninstall.command.js";

/** The public command registry, in display order (init first). Every v0.1 verb is now live. */
export const PUBLIC_COMMANDS: CommandModule[] = [
  initCommand,
  setupCommand,
  statusCommand,
  activeSessionIdCommand,
  logCommand,
  showCommand,
  linkCommand,
  pushCommand,
  fetchCommand,
  attachCommand,
  doctorCommand,
  uninstallCommand,
];

/** Public verb names — must match scripts/expected-verbs.json (verb-coverage test). */
export const PUBLIC_COMMAND_NAMES: string[] = PUBLIC_COMMANDS.map((c) => c.name);
