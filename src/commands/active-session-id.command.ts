import { existsSync } from "node:fs";
import { RealGitClient } from "../git/GitClient.js";
import { SessionLedger } from "../ledger/SessionLedger.js";
import { localPaths } from "../localstate/paths.js";
import type { CommandModule } from "./CommandModule.js";

/** Which session(s) jejak considers open for this repo (DESIGN-LLD §16.5). Prints nothing → exit 0. */
export const activeSessionIdCommand: CommandModule = {
  name: "active-session-id",
  register(program) {
    program
      .command("active-session-id")
      .description("List open capture session IDs")
      .option("--all-open", "Print every open session (one per line)")
      .action(async (opts: { allOpen?: boolean }) => {
        const git = new RealGitClient(process.cwd());
        let repoRoot: string;
        try {
          repoRoot = await git.repoRoot();
        } catch {
          return; // not a repo → nothing, exit 0
        }
        const dbPath = localPaths(repoRoot).ledgerDb;
        if (!existsSync(dbPath)) return; // no ledger yet → nothing, exit 0

        const ledger = new SessionLedger(dbPath);
        try {
          if (opts.allOpen) {
            for (const id of ledger.listOpen()) process.stdout.write(`${id}\n`);
          } else {
            const id = ledger.mostRecentOpen();
            if (id) process.stdout.write(`${id}\n`);
          }
        } finally {
          ledger.close();
        }
      });
  },
};
