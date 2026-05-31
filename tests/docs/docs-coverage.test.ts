import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli.js";
import { DocsService } from "../../src/docs/DocsService.js";
import { CoverageChecker } from "../../src/docs/coverage/CoverageChecker.js";
import { nodeDocsFs } from "../../src/docs/createDocsDeps.js";
import { SourceHasher } from "../../src/docs/freshness/SourceHasher.js";
import { LinkChecker } from "../../src/docs/links/LinkChecker.js";
import { DocsRegistry } from "../../src/docs/registry/DocsRegistry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const userDir = join(root, "docs/user");

/** The CI guard that keeps user docs from drifting (item 4.5, Tier 2). */
describe("docs coverage guard", () => {
  const registry = DocsRegistry.load(nodeDocsFs, root);

  it("every shipped verb and concept has a page", () => {
    expect(new CoverageChecker(nodeDocsFs, root).check(registry)).toEqual([]);
  });

  it("commands.md matches a fresh docs:gen (reference is not stale)", () => {
    const generated = new DocsService({
      fs: nodeDocsFs,
      buildProgram: createProgram,
      repoRoot: root,
    }).generateReference();
    const committed = readFileSync(join(userDir, "commands.md"), "utf8");
    expect(committed).toBe(generated);
  });

  it("every shipped concept page is fresh against its bound sources", () => {
    const hasher = new SourceHasher(nodeDocsFs, root);
    for (const concept of registry.shippedConcepts()) {
      const page = readFileSync(join(userDir, concept.page), "utf8");
      const result = hasher.check(concept, page);
      expect(result, `${concept.id}: ${JSON.stringify(result)}`).toMatchObject({ fresh: true });
    }
  });

  it("internal links in user docs resolve", () => {
    const linkChecker = new LinkChecker(nodeDocsFs);
    const pages = ["README.md", "init.md", "concepts/shadow-branch.md"];
    for (const rel of pages) {
      const path = join(userDir, rel);
      expect(existsSync(path), `${rel} exists`).toBe(true);
      expect(linkChecker.check(path, readFileSync(path, "utf8"))).toEqual([]);
    }
  });
});
