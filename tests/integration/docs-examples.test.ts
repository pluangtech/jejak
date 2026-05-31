import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ExampleExtractor } from "../../src/docs/examples/ExampleExtractor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "src/cli.ts");

/** Run a `jejak …` example command through the real CLI (via tsx); return exit code + output. */
function runJejak(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", "tsx", cli, ...args], {
      cwd: root,
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

/** Tier-2 executable docs: every `<!-- run -->`-tagged example must actually work. */
describe("docs executable examples", () => {
  const extractor = new ExampleExtractor();
  const readme = readFileSync(join(root, "docs/user/README.md"), "utf8");
  const examples = extractor
    .extract(readme)
    .flatMap((ex) => ex.commands)
    .filter((cmd) => cmd.startsWith("jejak "));

  it("README contains at least one runnable jejak example", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)("`%s` exits 0", (command) => {
    const args = command.replace(/^jejak\s+/, "").split(/\s+/);
    expect(runJejak(args).code).toBe(0);
  });
});
