import { dirname, resolve } from "node:path";
import type { DocsFs } from "../DocsDeps.js";

export interface BrokenLink {
  file: string;
  target: string;
}

const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/** Verifies that relative markdown links resolve on disk. External (`http`) links are skipped. */
export class LinkChecker {
  constructor(private readonly fs: DocsFs) {}

  /** Return broken relative links in `content`, where `filePath` is the file's absolute path. */
  check(filePath: string, content: string): BrokenLink[] {
    const broken: BrokenLink[] = [];
    const baseDir = dirname(filePath);

    for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
      const target = match[1].trim();
      if (this.isExternalOrInPage(target)) continue;
      const path = target.split("#")[0];
      if (!path) continue; // pure in-page anchor
      if (!this.fs.exists(resolve(baseDir, path))) broken.push({ file: filePath, target });
    }
    return broken;
  }

  private isExternalOrInPage(target: string): boolean {
    return (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      target.startsWith("#")
    );
  }
}
