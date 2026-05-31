import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli.js";
import {
  CommandReferenceRenderer,
  GENERATED_BANNER,
} from "../../src/docs/render/CommandReferenceRenderer.js";

function fakeProgram(): Command {
  const program = new Command("jejak");
  program.command("alpha").description("First public command");
  program.command("beta").description("Second public command");
  const hidden = new Command("_dev").description("internal");
  hidden.command("strip");
  program.addCommand(hidden, { hidden: true });
  return program;
}

describe("CommandReferenceRenderer", () => {
  const renderer = new CommandReferenceRenderer();

  it("includes the generated banner and a heading per public command", () => {
    const md = renderer.render(fakeProgram());
    expect(md).toContain(GENERATED_BANNER);
    expect(md).toContain("## `jejak alpha`");
    expect(md).toContain("## `jejak beta`");
    expect(md).toContain("First public command");
  });

  it("excludes hidden internal command groups", () => {
    const md = renderer.render(fakeProgram());
    expect(md).not.toContain("_dev");
  });

  it("renders deterministically (same program → same markdown)", () => {
    expect(renderer.render(fakeProgram())).toEqual(renderer.render(fakeProgram()));
    expect(renderer.render(createProgram())).toEqual(renderer.render(createProgram()));
  });

  it("documents every public verb of the real CLI", () => {
    const md = renderer.render(createProgram());
    for (const name of ["init", "setup", "doctor", "uninstall"]) {
      expect(md).toContain(`## \`jejak ${name}\``);
    }
  });
});
