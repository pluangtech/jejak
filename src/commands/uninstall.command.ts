import { InitError } from "../errors.js";
import { runUninstall } from "../uninstall/runUninstall.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak uninstall [--purge]` — remove jejak's hooks; optional local-state purge (item 6d). */
export const uninstallCommand: CommandModule = {
  name: "uninstall",
  register(program, deps) {
    program
      .command("uninstall")
      .description("Remove hooks; optional local state purge")
      .option("--purge", "Remove ~/.jejak/<repo-hash>/ state")
      .action(async (opts: { purge?: boolean }) => {
        try {
          await runUninstall({ purge: opts.purge }, deps);
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
