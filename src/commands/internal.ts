import { Command } from "commander";
import { devReadFixture } from "../dev/read_fixture.js";
import { devStrip } from "../dev/strip.js";
import { devWriteFixture } from "../dev/write_fixture.js";
import { notImplemented } from "../stub.js";

function failExit(e: unknown): never {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

/** Register the hidden `_hook` and `_dev` command groups. */
export function registerInternalCommands(program: Command): void {
  const hook = new Command("_hook").description("Internal hook dispatcher");
  hook.command("session-start").action(() => notImplemented(5, "§9"));
  hook.command("stop").action(() => notImplemented(5, "§9"));
  hook.command("session-end").action(() => notImplemented(5, "§9"));
  hook.command("prepare-commit-msg").action(() => notImplemented(5, "§10.5"));
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
