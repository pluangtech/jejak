import { Option } from "commander";
import { InitError } from "../errors.js";
import { runInit } from "../init/runInit.js";
import type { CommandModule } from "./CommandModule.js";

interface InitOpts {
  agent?: string;
  project?: boolean;
  global?: boolean;
  iKnowWhatImDoing?: boolean;
}

export const initCommand: CommandModule = {
  name: "init",
  register(program, deps) {
    program
      .command("init")
      .description("Add jejak to this repo; detect agent and record choice")
      .option("--agent <id>", "Agent adapter (non-interactive): claude-code")
      .option("--project", "Install jejak as a project devDependency (Node repos)")
      .option("--global", "Use a global jejak install (any repo)")
      .addOption(new Option("--i-know-what-im-doing").hideHelp())
      .action(async (opts: InitOpts) => {
        try {
          await runInit(
            {
              agent: opts.agent,
              project: opts.project,
              global: opts.global,
              iKnowWhatImDoing: opts.iKnowWhatImDoing,
            },
            deps,
          );
        } catch (err) {
          if (err instanceof InitError) {
            console.error(err.message);
            process.exit(err.exitCode);
          }
          throw err;
        }
      });
  },
};
