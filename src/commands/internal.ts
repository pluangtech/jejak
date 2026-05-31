import { existsSync } from "node:fs";
import { Command } from "commander";
import { devReadFixture } from "../dev/read_fixture.js";
import { devStrip } from "../dev/strip.js";
import { devWriteFixture } from "../dev/write_fixture.js";
import { RealGitClient } from "../git/GitClient.js";
import { runPrepareCommitMsg } from "../hooks/PrepareCommitMsgHandler.js";
import { isDisabled } from "../hooks/disabled.js";
import { SessionLedger } from "../ledger/SessionLedger.js";
import { localPaths } from "../localstate/paths.js";

function failExit(e: unknown): never {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

/** Register the hidden `_hook` and `_dev` command groups. */
export function registerInternalCommands(program: Command): void {
  const hook = new Command("_hook").description("Internal hook dispatcher");
  // Agent-event handlers land in item 5b; wired-but-no-op until then (fail-open, exit 0).
  hook.command("session-start").action(() => {});
  hook.command("stop").action(() => {});
  hook.command("session-end").action(() => {});
  // prepare-commit-msg (5a): stamp one Jejak-Session trailer per open session. ALWAYS exit 0.
  hook
    .command("prepare-commit-msg")
    .argument("[msgfile]", "commit message file")
    .argument("[source]", "commit source")
    .argument("[sha]", "commit object name")
    .action(async (msgfile?: string) => {
      try {
        if (!msgfile) return;
        const git = new RealGitClient(process.cwd());
        const repoRoot = await git.repoRoot();
        if (isDisabled(repoRoot)) return;
        const dbPath = localPaths(repoRoot).ledgerDb;
        if (!existsSync(dbPath)) return; // no ledger yet → no trailers
        const ledger = new SessionLedger(dbPath);
        try {
          await runPrepareCommitMsg(msgfile, { repoRoot, git, ledger });
        } finally {
          ledger.close();
        }
      } catch {
        // fail-open: a trailer failure must never block the commit
      }
    });
  program.addCommand(hook, { hidden: true });

  const dev = new Command("_dev").description("Internal dev/test commands");
  dev
    .command("strip")
    .description("Strip a raw JSONL transcript (item 3)")
    .argument("<path>", "Path to raw JSONL")
    .option("--resume-from <offset>", "Resume strip from byte offset")
    .option("--strip-thinking", "Redact thinking blocks")
    .option("--payloads-dir <dir>", "Write offloaded payloads to <dir>/<sha>")
    .action(
      async (
        path: string,
        o: { resumeFrom?: string; stripThinking?: boolean; payloadsDir?: string },
      ) => {
        const n = o.resumeFrom != null ? Number(o.resumeFrom) : Number.NaN;
        try {
          await devStrip({
            path,
            resumeFrom: Number.isFinite(n) ? n : undefined,
            stripThinking: Boolean(o.stripThinking),
            payloadsDir: o.payloadsDir,
          });
        } catch (e) {
          console.error(e instanceof Error ? e.message : String(e));
          process.exit(1);
        }
      },
    );
  dev
    .command("write-fixture")
    .description("Strip a raw transcript and write the session to the shadow ref (item 4)")
    .argument("<raw-path>", "Path to a raw transcript")
    .requiredOption("--session <id>", "Session id")
    .requiredOption("--handle <handle>", "Dev handle")
    .option("--agent <id>", "Agent (default claude-code)")
    .action(async (rawPath: string, o: { session: string; handle: string; agent?: string }) => {
      try {
        await devWriteFixture({ rawPath, sessionId: o.session, handle: o.handle, agent: o.agent });
      } catch (e) {
        failExit(e);
      }
    });
  dev
    .command("read-fixture")
    .description("Read a session's events back from the shadow ref (item 4)")
    .requiredOption("--session <id>", "Session id")
    .requiredOption("--handle <handle>", "Dev handle")
    .action(async (o: { session: string; handle: string }) => {
      try {
        await devReadFixture({ sessionId: o.session, handle: o.handle });
      } catch (e) {
        failExit(e);
      }
    });
  program.addCommand(dev, { hidden: true });
}
