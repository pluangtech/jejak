import { ConsoleReporter } from "../app/AppDeps.js";
import { runDoctor } from "../doctor.js";
import { RealGitClient } from "../git/GitClient.js";
import type { CommandModule } from "./CommandModule.js";

export const doctorCommand: CommandModule = {
  name: "doctor",
  register(program) {
    program
      .command("doctor")
      .description("Diagnostics for setup, sync, and capture health")
      .option("--trace", "Verbose diagnostic trace (full diagnostics land in item 6)")
      .action(async () => {
        const git = new RealGitClient(process.cwd());
        let repoRoot: string;
        try {
          repoRoot = await git.repoRoot();
        } catch {
          console.error("jejak: not a git repository");
          process.exit(1);
        }
        runDoctor({ repoRoot, reporter: new ConsoleReporter() });
      });
  },
};
