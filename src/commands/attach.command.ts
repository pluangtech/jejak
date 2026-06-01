import { AttachError, runAttach } from "../attach/runAttach.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak attach <session-id>` — recover a missed capture and link it to HEAD (item 6d). */
export const attachCommand: CommandModule = {
  name: "attach",
  register(program, deps) {
    program
      .command("attach")
      .description("Recover a missed capture into the shadow branch")
      .argument("<session-id>", "Session ID")
      .option("--force", "Skip the amend confirmation")
      .action(async (sessionId: string, opts: { force?: boolean }) => {
        try {
          await runAttach(deps, sessionId, opts);
        } catch (err) {
          if (err instanceof AttachError) {
            console.error(err.message);
            process.exit(1);
          }
          throw err;
        }
      });
  },
};
