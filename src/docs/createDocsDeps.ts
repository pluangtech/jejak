import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createProgram } from "../cli.js";
import type { DocsDeps, DocsFs } from "./DocsDeps.js";

/** Real filesystem implementation of {@link DocsFs}. */
export const nodeDocsFs: DocsFs = {
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => writeFileSync(path, content),
  exists: (path) => existsSync(path),
  listFiles: (dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  },
};

/** Build the default production docs dependency set (real fs, real CLI program). */
export function createDocsDeps(repoRoot: string = process.cwd()): DocsDeps {
  return { fs: nodeDocsFs, buildProgram: createProgram, repoRoot };
}

/** Conventional doc paths, resolved against the repo root. */
export const docsPaths = {
  userDir: (root: string) => join(root, "docs/user"),
  commandsFile: (root: string) => join(root, "docs/user/commands.md"),
};
