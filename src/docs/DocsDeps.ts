import type { Command } from "commander";

/** Minimal filesystem seam the docs layer needs — injectable so units use an in-memory fake. */
export interface DocsFs {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  /** File names (not full paths) directly under `dir`; `[]` if `dir` is absent. */
  listFiles(dir: string): string[];
}

/** Injected collaborators for the docs layer (the docs DI root). */
export interface DocsDeps {
  fs: DocsFs;
  /**
   * Factory for a fresh CLI program. A factory (not a single instance) keeps the reference
   * render deterministic — commander mutates a `Command` once it parses.
   */
  buildProgram: () => Command;
  /** Absolute repo root; doc/source paths resolve against it. */
  repoRoot: string;
}
