import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InitError } from "../../src/errors.js";
import { ResolveAgentStep } from "../../src/init/steps/ResolveAgentStep.js";
import { makeCtx } from "../helpers/ctx.js";
import { FakePrompter } from "../helpers/fakes.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-agent-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const step = new ResolveAgentStep();

describe("ResolveAgentStep", () => {
  it("uses the --agent flag without prompting", async () => {
    const prompter = new FakePrompter();
    const ctx = makeCtx({ repoRoot: dir, flags: { agent: "claude-code" }, prompter });
    await step.run(ctx);
    expect(ctx.agent?.id).toBe("claude-code");
    expect(prompter.calls).toEqual([]);
  });

  it("keeps the existing agent on re-init", async () => {
    const ctx = makeCtx({
      repoRoot: dir,
      existing: { v: 1, agent: "claude-code", mode: "project" },
    });
    await step.run(ctx);
    expect(ctx.agent?.id).toBe("claude-code");
  });

  it("fails in a non-interactive shell without --agent", async () => {
    const ctx = makeCtx({ repoRoot: dir, prompter: new FakePrompter({ isInteractive: false }) });
    await expect(step.run(ctx)).rejects.toBeInstanceOf(InitError);
  });

  it("confirms a single detected agent", async () => {
    mkdirSync(join(dir, ".claude"));
    const prompter = new FakePrompter({ confirm: true });
    const ctx = makeCtx({ repoRoot: dir, prompter });
    await step.run(ctx);
    expect(ctx.agent?.id).toBe("claude-code");
    expect(prompter.calls.some((c) => c.startsWith("confirm:"))).toBe(true);
  });

  it("shows a picker when nothing is detected", async () => {
    const prompter = new FakePrompter();
    const ctx = makeCtx({ repoRoot: dir, prompter });
    await step.run(ctx);
    expect(ctx.agent?.id).toBe("claude-code");
    expect(prompter.calls.some((c) => c.startsWith("select:"))).toBe(true);
  });
});
