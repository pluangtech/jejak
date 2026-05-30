import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { notImplemented } from "./stub.js";
import { VERSION } from "./version.js";

/** Public subcommands — must match scripts/expected-verbs.json */
export const PUBLIC_COMMAND_NAMES = [
  "init",
  "install",
  "status",
  "active-session-id",
  "log",
  "show",
  "link",
  "push",
  "fetch",
  "attach",
  "doctor",
  "uninstall",
] as const;

function stubAction(item: number, lldSection?: string) {
  return () => {
    notImplemented(item, lldSection);
  };
}

export function createProgram(): Command {
  const program = new Command("jejak")
    .name("jejak")
    .description("Capture AI agent session traces in git")
    .version(VERSION);

  program
    .command("init")
    .description("Initialize jejak shadow branch and repo config")
    .action(stubAction(4, "§10.1"));

  program
    .command("install")
    .description("Install agent and git hooks")
    .option("--claude-code", "Wire Claude Code hooks")
    .option("--force", "Refresh hook scripts after upgrade")
    .action(stubAction(5, "§9"));

  program
    .command("status")
    .description("Local vs origin trace branch state")
    .action(stubAction(6, "§16"));

  program
    .command("active-session-id")
    .description("List open capture session IDs")
    .action(stubAction(5, "§11"));

  program.command("log").description("List captured sessions").action(stubAction(6, "§16"));

  program
    .command("show")
    .description("Show a captured session trace")
    .argument("[session-id]", "Session ID")
    .action(stubAction(6, "§16"));

  program
    .command("link")
    .description("Link a git commit to session(s)")
    .argument("<sha>", "Commit SHA")
    .action(stubAction(6, "§16"));

  program.command("push").description("Push trace branch to origin").action(stubAction(6, "§16"));

  program
    .command("fetch")
    .description("Fetch and merge traces from origin")
    .action(stubAction(6, "§16"));

  program
    .command("attach")
    .description("Recover a missed capture into the shadow branch")
    .action(stubAction(6, "§16"));

  program
    .command("doctor")
    .description("Diagnostics for install, sync, and capture health")
    .option("--trace", "Verbose diagnostic trace")
    .action(stubAction(6, "§16"));

  program
    .command("uninstall")
    .description("Remove hooks; optional local state purge")
    .option("--purge", "Remove ~/.jejak/<repo-hash>/ state")
    .action(stubAction(6, "§16"));

  const hook = new Command("_hook").description("Internal hook dispatcher");
  hook.command("session-start").action(stubAction(5, "§9"));
  hook.command("stop").action(stubAction(5, "§9"));
  hook.command("session-end").action(stubAction(5, "§9"));
  hook.command("prepare-commit-msg").action(stubAction(5, "§10.5"));
  program.addCommand(hook, { hidden: true });

  const dev = new Command("_dev").description("Internal dev/test commands");
  dev
    .command("strip")
    .description("Strip a raw JSONL transcript (item 3)")
    .option("--resume-from <offset>", "Resume strip from byte offset")
    .argument("<path>", "Path to raw JSONL")
    .action(stubAction(3, "§8"));
  dev
    .command("write-fixture")
    .description("Write a test fixture blob (item 4)")
    .action(stubAction(4, "§10"));
  dev
    .command("read-fixture")
    .description("Read a test fixture blob (item 4)")
    .action(stubAction(4, "§10"));
  program.addCommand(dev, { hidden: true });

  return program;
}

export function runCli(argv: string[] = process.argv): void {
  const program = createProgram();
  program.parse(argv);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
