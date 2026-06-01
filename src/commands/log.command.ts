import { resolveDevHandle } from "../handle/HandleResolver.js";
import { SessionReader } from "../read/SessionReader.js";
import { runLog } from "../read/log.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak log` — list captured sessions with their analytics (item 6b). */
export const logCommand: CommandModule = {
  name: "log",
  register(program, deps) {
    program
      .command("log")
      .description("List captured sessions")
      .option("--all", "Show sessions from every dev handle (default: yours)")
      .option("--json", "Emit JSON")
      .action(async (opts: { all?: boolean; json?: boolean }) => {
        let handleSlug: string | undefined;
        if (!opts.all) {
          try {
            handleSlug = await resolveDevHandle({ git: deps.git });
          } catch {
            handleSlug = undefined; // no handle resolvable → fall back to all
          }
        }
        await runLog(new SessionReader(deps.git), deps.reporter, { ...opts, handleSlug });
      });
  },
};
