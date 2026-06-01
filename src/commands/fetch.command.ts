import { SyncRepository } from "../sync/SyncRepository.js";
import { runFetch } from "../sync/fetch.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak fetch` — pull and merge origin's traces into the local shadow ref (item 6c). */
export const fetchCommand: CommandModule = {
  name: "fetch",
  register(program, deps) {
    program
      .command("fetch")
      .description("Fetch and merge traces from origin")
      .action(async () => {
        await runFetch(new SyncRepository(deps.git), deps.reporter);
      });
  },
};
