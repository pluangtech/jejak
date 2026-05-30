import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InitError } from "../../src/errors.js";
import { GuardStep } from "../../src/init/steps/GuardStep.js";
import { makeCtx } from "../helpers/ctx.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-guard-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const guard = new GuardStep();

describe("GuardStep", () => {
  it("refuses the jejak development repo (package.json name === own name)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "jejak" }));
    await expect(guard.run(makeCtx({ repoRoot: dir }))).rejects.toBeInstanceOf(InitError);
  });

  it("proceeds for a different package name", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "my-app" }));
    await expect(guard.run(makeCtx({ repoRoot: dir }))).resolves.toBeUndefined();
  });

  it("proceeds with no package.json (non-Node repo)", async () => {
    await expect(guard.run(makeCtx({ repoRoot: dir }))).resolves.toBeUndefined();
  });

  it("proceeds with an unparseable package.json", async () => {
    writeFileSync(join(dir, "package.json"), "{ not json");
    await expect(guard.run(makeCtx({ repoRoot: dir }))).resolves.toBeUndefined();
  });

  it("honors the --i-know-what-im-doing override", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "jejak" }));
    await expect(
      guard.run(makeCtx({ repoRoot: dir, flags: { iKnowWhatImDoing: true } })),
    ).resolves.toBeUndefined();
  });
});
