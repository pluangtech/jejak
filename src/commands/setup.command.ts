import { Option } from "commander";
import { ConsoleReporter } from "../app/AppDeps.js";
import { InitError } from "../errors.js";
import { RealGitClient } from "../git/GitClient.js";
import { runSetup } from "../setup/runSetup.js";
import type { CommandModule } from "./CommandModule.js";

interface SetupOpts {
  claudeCode?: boolean;
  force?: boolean;
  iKnowWhatImDoing?: boolean;
}

export const setupCommand: CommandModule = {
  name: "setup",
  register(program) {
    program
      .command("setup")
      .description("Configure hooks for a supported agent")
      .option("--claude-code", "Configure Claude Code hooks (v0.1)")
      .option("--force", "Re-write hook scripts after a CLI upgrade")
      .addOption(new Option("--i-know-what-im-doing").hideHelp())
      .action(async (opts: SetupOpts) => {
        try {
          await runSetup(
            {
              claudeCode: opts.claudeCode,
              force: opts.force,
              iKnowWhatImDoing: opts.iKnowWhatImDoing,
            },
            { git: new RealGitClient(process.cwd()), reporter: new ConsoleReporter() },
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
