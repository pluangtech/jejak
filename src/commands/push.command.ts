import { loadCatalog } from "../pii/loadCatalog.js";
import { SyncRepository } from "../sync/SyncRepository.js";
import { PushBlockedError, runPush } from "../sync/push.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak push` — share the shadow ref to origin, behind the PII hard-gate (item 6c). */
export const pushCommand: CommandModule = {
  name: "push",
  register(program, deps) {
    program
      .command("push")
      .description("Push trace branch to origin")
      .action(async () => {
        let repoRoot: string;
        try {
          repoRoot = await deps.git.repoRoot();
        } catch {
          console.error("jejak: not a git repository");
          process.exit(1);
        }
        const catalogOk = loadCatalog(repoRoot).ok;
        try {
          await runPush(new SyncRepository(deps.git), deps.reporter, { catalogOk });
        } catch (err) {
          if (err instanceof PushBlockedError) {
            console.error(err.message);
            process.exit(1);
          }
          throw err;
        }
      });
  },
};
