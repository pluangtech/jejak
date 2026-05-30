import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUBLIC_COMMAND_NAMES, createProgram } from "../src/cli.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = JSON.parse(readFileSync(join(root, "scripts/expected-verbs.json"), "utf8")) as {
  commands: string[];
};

describe("verb coverage", () => {
  it("PUBLIC_COMMAND_NAMES matches expected-verbs.json", () => {
    expect([...PUBLIC_COMMAND_NAMES].sort()).toEqual([...expected.commands].sort());
  });

  it("program public commands match manifest", () => {
    const program = createProgram();
    const actual = program.commands
      .map((cmd) => cmd.name())
      .filter((name) => !name.startsWith("_"))
      .sort();
    expect(actual).toEqual([...expected.commands].sort());
  });
});
