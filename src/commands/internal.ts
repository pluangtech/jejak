import { existsSync } from "node:fs";
import { Command } from "commander";
import { captureSnapshot } from "../capture/captureSnapshot.js";
import { devReadFixture } from "../dev/read_fixture.js";
import { devStrip } from "../dev/strip.js";
import { devWriteFixture } from "../dev/write_fixture.js";
import { RealGitClient } from "../git/GitClient.js";
import { createCaptureContext } from "../hooks/CaptureContext.js";
import { dispatchHook } from "../hooks/HookRouter.js";
import { runPrepareCommitMsg } from "../hooks/PrepareCommitMsgHandler.js";
import { isDisabled } from "../hooks/disabled.js";
import { failOpen } from "../hooks/failOpen.js";
import { parseHookPayload, readStdin } from "../hooks/payload.js";
import { SessionLedger } from "../ledger/SessionLedger.js";
import { localPaths } from "../localstate/paths.js";

function failExit(e: unknown): never {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

/** Read the Claude stdin payload, build the capture context, and dispatch the event (fail-open). */
async function runAgentHook(event: string): Promise<void> {
  const payload = parseHookPayload(await readStdin());
  if (!payload) return; // no session id → nothing to do, exit 0
  const git = new RealGitClient(payload.cwd ?? process.cwd());
  let repoRoot: string;
  try {
    repoRoot = await git.repoRoot();
  } catch {
    return; // not a git repo → exit 0
  }
  const ctx = createCaptureContext(repoRoot, git);
  try {
    await failOpen({ repoRoot, hook: event, sessionId: payload.sessionId, log: ctx.log }, () =>
      dispatchHook(event, payload, ctx),
    );
  } finally {
    ctx.ledger.close();
  }
}

/** Register the hidden `_hook`, `_dev`, and `_worker` command groups. */
export function registerInternalCommands(program: Command): void {
  const hook = new Command("_hook").description("Internal hook dispatcher");
  // Agent events: read Claude payload on stdin → fail-open dispatch. Always exit 0.
  hook.command("session-start").action(() => runAgentHook("session-start"));
  hook.command("stop").action(() => runAgentHook("stop"));
  hook.command("session-end").action(() => runAgentHook("session-end"));
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

  // Detached snapshot worker (spawned by the SessionEnd hook). Runs the strip→stage→upsert pipeline.
  const worker = new Command("_worker").description("Internal detached snapshot worker");
  worker
    .requiredOption("--session <id>", "Session id")
    .option("--final", "Final capture (SessionEnd): poll commit, write final meta, clean staging")
    .action(async (o: { session: string; final?: boolean }) => {
      const git = new RealGitClient(process.cwd());
      let repoRoot: string;
      try {
        repoRoot = await git.repoRoot();
      } catch {
        return;
      }
      const ctx = createCaptureContext(repoRoot, git);
      try {
        await captureSnapshot(o.session, ctx, { final: Boolean(o.final) });
      } catch (e) {
        ctx.log(`_worker error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        ctx.ledger.close();
      }
    });
  program.addCommand(worker, { hidden: true });
}
