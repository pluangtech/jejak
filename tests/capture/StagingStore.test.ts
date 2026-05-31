import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StagingStore } from "../../src/capture/StagingStore.js";

let home: string;
let repo: string;
let staging: StagingStore;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "jejak-stg-home-"));
  repo = "/some/repo";
  staging = new StagingStore(repo, home);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("StagingStore", () => {
  it("accumulates events across appends as canonical JSONL", () => {
    staging.appendEvents("s1", ['{"a":1}', '{"b":2}']);
    staging.appendEvents("s1", ['{"c":3}']);
    expect(staging.read("s1")).toBe('{"a":1}\n{"b":2}\n{"c":3}\n');
    expect(staging.eventCount("s1")).toBe(3);
  });

  it("is empty before any append and after clear", () => {
    expect(staging.read("s1")).toBe("");
    expect(staging.eventCount("s1")).toBe(0);
    staging.appendEvents("s1", ['{"a":1}']);
    staging.clear("s1");
    expect(staging.read("s1")).toBe("");
  });

  it("ignores an empty append", () => {
    staging.appendEvents("s1", []);
    expect(staging.read("s1")).toBe("");
  });
});
