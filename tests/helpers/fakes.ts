import type { Reporter } from "../../src/app/AppDeps.js";
import type { GitClient, TreeEntry } from "../../src/git/GitClient.js";
import type { Choice, Prompter } from "../../src/prompt/Prompter.js";

/** In-memory {@link GitClient} for unit tests — no real git, no disk. */
export class FakeGitClient implements GitClient {
  root: string;
  readonly config = new Map<string, string>();
  readonly globalConfig = new Map<string, string>();
  private readonly refs = new Set<string>();
  blobCount = 0;
  commits: Array<{ tree: string; message: string }> = [];
  casCalls: Array<{ ref: string; newSha: string; oldSha: string }> = [];

  constructor(
    root = "/repo",
    opts?: {
      existingRefs?: string[];
      config?: Record<string, string>;
      globalConfig?: Record<string, string>;
    },
  ) {
    this.root = root;
    for (const r of opts?.existingRefs ?? []) this.refs.add(r);
    for (const [k, v] of Object.entries(opts?.config ?? {})) this.config.set(k, v);
    for (const [k, v] of Object.entries(opts?.globalConfig ?? {})) this.globalConfig.set(k, v);
  }

  async repoRoot(): Promise<string> {
    return this.root;
  }
  async refExists(ref: string): Promise<boolean> {
    return this.refs.has(ref);
  }
  async resolveRef(ref: string): Promise<string | null> {
    return this.refs.has(ref) ? "commit1" : null;
  }
  async hashObject(): Promise<string> {
    this.blobCount += 1;
    return `blob${this.blobCount}`;
  }
  async catBlob(): Promise<Buffer> {
    return Buffer.alloc(0);
  }
  trailerCalls: Array<{ messageFile: string; trailers: string[] }> = [];
  async interpretTrailers(messageFile: string, trailers: string[]): Promise<void> {
    this.trailerCalls.push({ messageFile, trailers });
  }
  async writeTreeFromIndex(_entries: TreeEntry[], _baseTree?: string): Promise<string> {
    return "tree1";
  }
  async commitTree(tree: string, message: string, _parents?: string[]): Promise<string> {
    this.commits.push({ tree, message });
    return "commit1";
  }
  async updateRefCAS(ref: string, newSha: string, oldSha = ""): Promise<boolean> {
    this.casCalls.push({ ref, newSha, oldSha });
    this.refs.add(ref);
    return true;
  }
  async getConfig(key: string, opts?: { global?: boolean }): Promise<string | null> {
    return (opts?.global ? this.globalConfig : this.config).get(key) ?? null;
  }
  async setConfig(key: string, value: string): Promise<void> {
    this.config.set(key, value);
  }
}

/** Scripted {@link Prompter} for unit tests — no TTY. */
export class FakePrompter implements Prompter {
  isInteractive: boolean;
  private confirmReturns: boolean;
  private selectReturns: unknown;
  readonly calls: string[] = [];

  constructor(opts?: { isInteractive?: boolean; confirm?: boolean; select?: unknown }) {
    this.isInteractive = opts?.isInteractive ?? true;
    this.confirmReturns = opts?.confirm ?? true;
    this.selectReturns = opts?.select;
  }
  async confirm(message: string): Promise<boolean> {
    this.calls.push(`confirm:${message}`);
    return this.confirmReturns;
  }
  async select<T>(message: string, choices: Choice<T>[]): Promise<T> {
    this.calls.push(`select:${message}`);
    return (this.selectReturns ?? choices[0].value) as T;
  }
}

/** {@link Reporter} that retains lines (flush is a no-op) so tests can assert output. */
export class CollectingReporter implements Reporter {
  readonly lines: string[] = [];
  line(message: string): void {
    this.lines.push(message);
  }
  flush(): void {}
  text(): string {
    return this.lines.join("\n");
  }
}
