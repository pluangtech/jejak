import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectAgents, supportedAdapters, validateAgentFlag } from "../../src/agents/registry.js";
import { InitError } from "../../src/errors.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-agents-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("detectAgents", () => {
  it("detects nothing in an empty repo", () => {
    expect(detectAgents(dir)).toEqual([]);
  });

  it("detects claude-code from .claude/settings.json", () => {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude", "settings.json"), "{}");
    const detected = detectAgents(dir);
    expect(detected.map((d) => d.id)).toContain("claude-code");
    expect(detected.find((d) => d.id === "claude-code")?.supported).toBe(true);
  });

  it("detects cursor but marks it unsupported", () => {
    mkdirSync(join(dir, ".cursor"));
    const detected = detectAgents(dir);
    const cursor = detected.find((d) => d.id === "cursor");
    expect(cursor?.supported).toBe(false);
  });

  it("detects multiple agents", () => {
    mkdirSync(join(dir, ".claude"));
    mkdirSync(join(dir, ".cursor"));
    expect(
      detectAgents(dir)
        .map((d) => d.id)
        .sort(),
    ).toEqual(["claude-code", "cursor"]);
  });
});

describe("validateAgentFlag", () => {
  it("accepts a supported agent", () => {
    expect(validateAgentFlag("claude-code")).toBe("claude-code");
  });
  it("rejects an unknown agent", () => {
    expect(() => validateAgentFlag("nope")).toThrow(InitError);
  });
  it("rejects a detected-but-unsupported agent", () => {
    expect(() => validateAgentFlag("cursor")).toThrow(InitError);
  });
});

describe("supportedAdapters", () => {
  it("offers only claude-code in v0.1", () => {
    expect(supportedAdapters().map((a) => a.id)).toEqual(["claude-code"]);
  });
});
