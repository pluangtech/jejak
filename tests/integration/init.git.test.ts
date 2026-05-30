import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDeps } from "../../src/app/AppDeps.js";
import { InitError } from "../../src/errors.js";
import { RealGitClient } from "../../src/git/GitClient.js";
import { runInit } from "../../src/init/runInit.js";
import { SHADOW_REF } from "../../src/shadow/constants.js";
import { CollectingReporter, FakePrompter } from "../helpers/fakes.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

let dir: string;
let root: string;
let reporter: CollectingReporter;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jejak-it-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Aditya Jha"]);
  git(dir, ["config", "user.email", "aditya@example.com"]);
  root = git(dir, ["rev-parse", "--show-toplevel"]);
  reporter = new CollectingReporter();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function deps(prompter = new FakePrompter()): AppDeps {
  return { git: new RealGitClient(dir), prompter, reporter };
}

describe("jejak init (integration)", () => {
  it("project mode: adds devDependency, creates the shadow ref, keeps the work tree on the dev branch", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "testproj" }, null, 2));
    await runInit({ agent: "claude-code", project: true }, deps());

    expect(JSON.parse(readFileSync(join(root, ".jejak/config.json"), "utf8"))).toEqual({
      v: 1,
      agent: "claude-code",
      mode: "project",
    });
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.devDependencies?.jejak).toBeDefined();

    expect(git(dir, ["show-ref", "--verify", SHADOW_REF])).toContain(SHADOW_REF);
    // never checked out: HEAD/working tree stay on the dev branch
    expect(git(dir, ["branch", "--show-current"])).toBe("main");
    // no working-tree .gitattributes — shadow merge rules live only on the seed tree
    expect(existsSync(join(root, ".gitattributes"))).toBe(false);
    expect(existsSync(join(root, ".jejakignore"))).toBe(true);
  });

  it("global mode: writes mode=global and never creates a package.json", async () => {
    await runInit({ agent: "claude-code", global: true }, deps());
    expect(JSON.parse(readFileSync(join(root, ".jejak/config.json"), "utf8")).mode).toBe("global");
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(git(dir, ["config", "--get", "merge.ours.driver"])).toBe("true");
  });

  it("seeds .gitattributes / README.md / VERSION on the shadow ref with the right merge rules", async () => {
    await runInit({ agent: "claude-code", global: true }, deps());
    const tree = git(dir, ["ls-tree", "--name-only", SHADOW_REF]);
    expect(tree.split("\n").sort()).toEqual([".gitattributes", "README.md", "VERSION"]);
    const attrs = git(dir, ["cat-file", "-p", `${SHADOW_REF}:.gitattributes`]);
    expect(attrs).toContain("sessions/** merge=ours");
    expect(attrs).toContain("index/**/by-commit.ndjson merge=union");
  });

  it("is idempotent: a second init leaves the ref sha unchanged and reports already initialized", async () => {
    await runInit({ agent: "claude-code", global: true }, deps());
    const sha1 = git(dir, ["rev-parse", SHADOW_REF]);

    const reporter2 = new CollectingReporter();
    await runInit(
      {},
      { git: new RealGitClient(dir), prompter: new FakePrompter(), reporter: reporter2 },
    );
    const sha2 = git(dir, ["rev-parse", SHADOW_REF]);

    expect(sha2).toBe(sha1);
    expect(reporter2.text()).toContain("already initialized");
  });

  it("resolves dev_handle deterministically from user.name", async () => {
    await runInit({ agent: "claude-code", global: true }, deps());
    expect(reporter.text()).toContain("dev_handle: aditya-jha");
  });

  it("refuses to initialize the jejak development repo (exit 1)", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "jejak" }));
    await expect(runInit({ agent: "claude-code" }, deps())).rejects.toMatchObject({
      name: "InitError",
      exitCode: 1,
    });
  });

  it("fails on a non-interactive shell without --agent (exit 1)", async () => {
    await expect(
      runInit({}, deps(new FakePrompter({ isInteractive: false }))),
    ).rejects.toBeInstanceOf(InitError);
  });

  it("errors when not in a git repository", async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "jejak-nonrepo-"));
    try {
      await expect(
        runInit(
          { agent: "claude-code", global: true },
          { git: new RealGitClient(nonRepo), prompter: new FakePrompter(), reporter },
        ),
      ).rejects.toThrow(/not a git repository/);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
