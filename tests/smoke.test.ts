import { describe, expect, it } from "vitest";
import { PUBLIC_COMMAND_NAMES, createProgram } from "../src/cli.js";
import { VERSION } from "../src/version.js";

describe("smoke", () => {
  it("exports version", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("registers all public commands", () => {
    const program = createProgram();
    const names = program.commands.map((cmd) => cmd.name());
    for (const name of PUBLIC_COMMAND_NAMES) {
      expect(names).toContain(name);
    }
  });

  it("hides internal commands from top-level help", () => {
    const program = createProgram();
    const help = program.helpInformation();
    expect(help).not.toContain("_hook");
    expect(help).not.toContain("_dev");
  });
});
