import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultMode, hasPackageJson, modeFor } from "../../src/modes/detectMode.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-mode-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("detectMode", () => {
  it("defaults to project when a package.json exists", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    expect(hasPackageJson(dir)).toBe(true);
    expect(defaultMode(dir).mode).toBe("project");
  });

  it("defaults to global without a package.json", () => {
    expect(hasPackageJson(dir)).toBe(false);
    expect(defaultMode(dir).mode).toBe("global");
  });

  it("modeFor maps the stored mode", () => {
    expect(modeFor("project").mode).toBe("project");
    expect(modeFor("global").mode).toBe("global");
  });
});
