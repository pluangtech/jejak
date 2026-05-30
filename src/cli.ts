import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { createAppDeps } from "./app/createAppDeps.js";
import { PUBLIC_COMMANDS, PUBLIC_COMMAND_NAMES } from "./commands/index.js";
import { registerInternalCommands } from "./commands/internal.js";
import { VERSION } from "./version.js";

/** Re-exported for the verb-coverage + smoke tests. */
export { PUBLIC_COMMAND_NAMES };

export function createProgram(): Command {
  const program = new Command("jejak")
    .name("jejak")
    .description("Capture AI agent session traces in git")
    .version(VERSION);

  const deps = createAppDeps();
  for (const command of PUBLIC_COMMANDS) command.register(program, deps);
  registerInternalCommands(program);

  return program;
}

export function runCli(argv: string[] = process.argv): void {
  const program = createProgram();
  program.parse(argv);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
