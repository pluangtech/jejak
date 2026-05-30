import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitError } from "../errors.js";

/** One entry to stage into a throwaway index when composing a tree. */
export interface TreeEntry {
  /** git mode, e.g. "100644" for a regular file. */
  mode: string;
  /** blob SHA (already written via hashObject). */
  sha: string;
  /** path inside the tree, e.g. ".gitattributes". */
  path: string;
}

/**
 * Facade over the `git` CLI. The single seam through which the rest of jejak speaks to git —
 * callers use typed methods, never raw argv. Mockable in tests (see FakeGitClient).
 */
export interface GitClient {
  /** Absolute path to the repo's top-level working directory. Throws if not a work tree. */
  repoRoot(): Promise<string>;
  /** True if `ref` resolves; never throws on a missing ref. */
  refExists(ref: string): Promise<boolean>;
  /** Write `content` as a blob; returns its SHA. */
  hashObject(content: string): Promise<string>;
  /** Build a tree from `entries` using a throwaway index; returns the tree SHA. */
  writeTreeFromIndex(entries: TreeEntry[]): Promise<string>;
  /** Create an orphan commit (no parent) wrapping `tree`; returns the commit SHA. */
  commitTree(tree: string, message: string): Promise<string>;
  /** Compare-and-swap a ref. `oldSha=""` means "must not already exist". Returns false on CAS miss. */
  updateRefCAS(ref: string, newSha: string, oldSha?: string): Promise<boolean>;
  /** Read a git config value, or null if unset. */
  getConfig(key: string, opts?: { global?: boolean }): Promise<string | null>;
  /** Set a (local) git config value. Idempotent. */
  setConfig(key: string, value: string): Promise<void>;
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runGit(
  args: string[],
  opts: { cwd: string; input?: string; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: opts.cwd, env: opts.env ?? process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    if (opts.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

/** Real {@link GitClient} that shells out to `git`, rooted at a starting directory. */
export class RealGitClient implements GitClient {
  constructor(private readonly cwd: string) {}

  private async run(args: string[], input?: string, env?: NodeJS.ProcessEnv): Promise<string> {
    const r = await runGit(args, { cwd: this.cwd, input, env });
    if (r.code !== 0) {
      throw new GitError(
        `git ${args.join(" ")} failed (${r.code}): ${r.stderr.trim()}`,
        r.code,
        args,
      );
    }
    return r.stdout;
  }

  async repoRoot(): Promise<string> {
    return (await this.run(["rev-parse", "--show-toplevel"])).trim();
  }

  async refExists(ref: string): Promise<boolean> {
    const r = await runGit(["rev-parse", "--verify", "--quiet", ref], { cwd: this.cwd });
    return r.code === 0;
  }

  async hashObject(content: string): Promise<string> {
    return (await this.run(["hash-object", "-w", "--stdin"], content)).trim();
  }

  async writeTreeFromIndex(entries: TreeEntry[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jejak-index-"));
    const indexFile = join(dir, "index");
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };
    try {
      for (const e of entries) {
        await this.run(
          ["update-index", "--add", "--cacheinfo", `${e.mode},${e.sha},${e.path}`],
          undefined,
          env,
        );
      }
      return (await this.run(["write-tree"], undefined, env)).trim();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async commitTree(tree: string, message: string): Promise<string> {
    // Pin a deterministic identity so the seed commit never depends on (or requires) the
    // developer's git user.* config.
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "jejak",
      GIT_AUTHOR_EMAIL: "jejak@localhost",
      GIT_COMMITTER_NAME: "jejak",
      GIT_COMMITTER_EMAIL: "jejak@localhost",
    };
    return (await this.run(["commit-tree", tree, "-m", message], undefined, env)).trim();
  }

  async updateRefCAS(ref: string, newSha: string, oldSha = ""): Promise<boolean> {
    const r = await runGit(["update-ref", ref, newSha, oldSha], { cwd: this.cwd });
    return r.code === 0;
  }

  async getConfig(key: string, opts?: { global?: boolean }): Promise<string | null> {
    const args = ["config", ...(opts?.global ? ["--global"] : []), "--get", key];
    const r = await runGit(args, { cwd: this.cwd });
    if (r.code === 0) return r.stdout.trim();
    if (r.code === 1) return null; // key not set
    throw new GitError(
      `git ${args.join(" ")} failed (${r.code}): ${r.stderr.trim()}`,
      r.code,
      args,
    );
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.run(["config", key, value]);
  }
}
