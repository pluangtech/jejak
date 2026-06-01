import { runLink } from "../read/link.js";
import type { CommandModule } from "./CommandModule.js";

/** `jejak link <sha>` — list the session(s) a commit is linked to via its trailers (item 6b). */
export const linkCommand: CommandModule = {
  name: "link",
  register(program, deps) {
    program
      .command("link")
      .description("Link a git commit to session(s)")
      .argument("<sha>", "Commit SHA")
      .option("--json", "Emit JSON")
      .action(async (sha: string, opts: { json?: boolean }) => {
        await runLink(deps.git, deps.reporter, sha, opts);
      });
  },
};
