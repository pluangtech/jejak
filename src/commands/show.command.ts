import { SessionReader } from "../read/SessionReader.js";
import { ShowError, runShow } from "../read/show.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak show <session-id>` — print a captured session's event stream (item 6b). */
export const showCommand: CommandModule = {
  name: "show",
  register(program, deps) {
    program
      .command("show")
      .description("Show a captured session trace")
      .argument("<session-id>", "Session ID")
      .option("--expand", "Resolve offloaded payloads to full content")
      .option("--json", "Emit JSON")
      .action(async (sessionId: string, opts: { expand?: boolean; json?: boolean }) => {
        try {
          await runShow(new SessionReader(deps.git), deps.reporter, sessionId, opts);
        } catch (err) {
          if (err instanceof ShowError) {
            console.error(err.message);
            process.exit(1);
          }
          throw err;
        }
      });
  },
};
