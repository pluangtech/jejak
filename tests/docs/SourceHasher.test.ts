import { describe, expect, it } from "vitest";
import { SourceHasher } from "../../src/docs/freshness/SourceHasher.js";
import type { ConceptEntry } from "../../src/docs/registry/types.js";
import { FakeDocsFs } from "../helpers/docsFakes.js";

const entry: ConceptEntry = {
  id: "c",
  title: "C",
  status: "shipped",
  page: "concepts/c.md",
  sources: ["src/a.ts", "src/b.ts"],
};

function page(hash: string): string {
  return `---\nconcept: c\nsources_hash: ${hash}\n---\n\n# C\n`;
}

describe("SourceHasher", () => {
  it("reports fresh when the recorded hash matches current sources", () => {
    const fs = new FakeDocsFs({ "/repo/src/a.ts": "AAA", "/repo/src/b.ts": "BBB" });
    const hasher = new SourceHasher(fs, "/repo");
    const { hash } = hasher.computeHash(entry);
    expect(hasher.check(entry, page(hash)).fresh).toBe(true);
  });

  it("reports stale when a source changed but the page did not", () => {
    const fs = new FakeDocsFs({ "/repo/src/a.ts": "AAA", "/repo/src/b.ts": "BBB" });
    const hasher = new SourceHasher(fs, "/repo");
    const { hash } = hasher.computeHash(entry);
    fs.writeFile("/repo/src/a.ts", "CHANGED");
    const result = hasher.check(entry, page(hash));
    expect(result.fresh).toBe(false);
    expect(result.recorded).toBe(hash);
    expect(result.actual).not.toBe(hash);
  });

  it("is order-independent in the source list", () => {
    const fs = new FakeDocsFs({ "/repo/src/a.ts": "AAA", "/repo/src/b.ts": "BBB" });
    const hasher = new SourceHasher(fs, "/repo");
    const reversed: ConceptEntry = { ...entry, sources: ["src/b.ts", "src/a.ts"] };
    expect(hasher.computeHash(entry).hash).toBe(hasher.computeHash(reversed).hash);
  });

  it("reports missing sources", () => {
    const fs = new FakeDocsFs({ "/repo/src/a.ts": "AAA" });
    const result = new SourceHasher(fs, "/repo").check(entry, page("sha256:whatever"));
    expect(result.missingSources).toEqual(["src/b.ts"]);
    expect(result.fresh).toBe(false);
  });
});
