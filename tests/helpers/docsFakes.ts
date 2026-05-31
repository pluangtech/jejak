import { dirname } from "node:path";
import type { DocsFs } from "../../src/docs/DocsDeps.js";

/** In-memory {@link DocsFs} for docs-layer unit tests — keyed by absolute path. */
export class FakeDocsFs implements DocsFs {
  readonly files = new Map<string, string>();

  constructor(init?: Record<string, string>) {
    for (const [path, content] of Object.entries(init ?? {})) this.files.set(path, content);
  }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`FakeDocsFs: no such file ${path}`);
    return content;
  }
  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }
  exists(path: string): boolean {
    return this.files.has(path);
  }
  listFiles(dir: string): string[] {
    const names: string[] = [];
    for (const path of this.files.keys()) {
      if (dirname(path) === dir) names.push(path.slice(dir.length + 1));
    }
    return names;
  }
}
