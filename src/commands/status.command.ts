import { SessionReader } from "../read/SessionReader.js";
import { runStatus } from "../read/status.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak status` — local vs origin state of the shadow ref (item 6b). */
export const statusCommand: CommandModule = {
  name: "status",
  register(program, deps) {
    program
      .command("status")
      .description("Local vs origin trace branch state")
      .option("--json", "Emit JSON")
      .action(async (opts: { json?: boolean }) => {
        await runStatus(deps.git, new SessionReader(deps.git), deps.reporter, opts);
      });
  },
};
