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
  /** Canned read responses (item 6b read path). */
  readonly blobs = new Map<string, Buffer>(); // catBlob(spec) → bytes
  lsTreeFiles: string[] = []; // lsTree(...) → these paths
  readonly bodies = new Map<string, string>(); // logBody(sha) → message
  readonly revCounts = new Map<string, number>(); // revListCount(range) → n
  /** Canned sync responses (item 6c). */
  fetchReturns: string | null = null; // fetch(...) → their tip
  pushResults: boolean[] = []; // queue: each push() shifts one (default true when empty)
  mergeTreeReturns = "mergedtree";
  readonly fetchCalls: Array<{ remote: string; ref: string }> = [];
  readonly pushCalls: Array<{ remote: string; ref: string }> = [];
  readonly mergeTreeCalls: Array<{ ours: string; theirs: string }> = [];

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
  async catBlob(spec: string): Promise<Buffer> {
    return this.blobs.get(spec) ?? Buffer.alloc(0);
  }
  async lsTree(_ref: string, path: string, _opts?: { recursive?: boolean }): Promise<string[]> {
    return this.lsTreeFiles.filter((f) => f.startsWith(path));
  }
  async logBody(sha: string): Promise<string | null> {
    return this.bodies.get(sha) ?? null;
  }
  async revListCount(range: string): Promise<number> {
    return this.revCounts.get(range) ?? 0;
  }
  trailerCalls: Array<{ messageFile: string; trailers: string[] }> = [];
  async interpretTrailers(messageFile: string, trailers: string[]): Promise<void> {
    this.trailerCalls.push({ messageFile, trailers });
  }
  commitForTrailer: string | null = null;
  async findCommitWithTrailer(): Promise<string | null> {
    return this.commitForTrailer;
  }
  detached = false;
  async isDetachedHead(): Promise<boolean> {
    return this.detached;
  }
  async appendTrailers(message: string, trailers: string[]): Promise<string> {
    const block = trailers.join("\n");
    return message.endsWith("\n") ? `${message}${block}\n` : `${message}\n\n${block}\n`;
  }
  amendedMessages: string[] = [];
  async amendHeadMessage(message: string): Promise<void> {
    this.amendedMessages.push(message);
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
  async fetch(remote: string, ref: string): Promise<string | null> {
    this.fetchCalls.push({ remote, ref });
    return this.fetchReturns;
  }
  async push(remote: string, ref: string): Promise<boolean> {
    this.pushCalls.push({ remote, ref });
    return this.pushResults.length > 0 ? (this.pushResults.shift() as boolean) : true;
  }
  async mergeTree(ours: string, theirs: string): Promise<string> {
    this.mergeTreeCalls.push({ ours, theirs });
    return this.mergeTreeReturns;
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
