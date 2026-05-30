import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, readConfig, writeConfig } from "../../src/config/ConfigStore.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-config-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("ConfigStore", () => {
  it("returns null when no config exists", () => {
    expect(readConfig(dir)).toBeNull();
  });

  it("round-trips a written config", () => {
    writeConfig(dir, { v: 1, agent: "claude-code", mode: "project" });
    expect(existsSync(configPath(dir))).toBe(true);
    expect(readConfig(dir)).toEqual({ v: 1, agent: "claude-code", mode: "project" });
  });

  it("does not store a dev_handle (per-dev, resolved lazily)", () => {
    writeConfig(dir, { v: 1, agent: "claude-code", mode: "global" });
    expect(readConfig(dir)).not.toHaveProperty("dev_handle");
  });
});
