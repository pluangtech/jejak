import { Command } from "commander";
import { devStrip } from "../dev/strip.js";
import { notImplemented } from "../stub.js";

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
    .description("Write a test fixture blob (item 4)")
    .action(() => notImplemented(4, "§10"));
  dev
    .command("read-fixture")
    .description("Read a test fixture blob (item 4)")
    .action(() => notImplemented(4, "§10"));
  program.addCommand(dev, { hidden: true });
}
