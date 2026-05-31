import { describe, expect, it } from "vitest";
import { LinkChecker } from "../../src/docs/links/LinkChecker.js";
import { FakeDocsFs } from "../helpers/docsFakes.js";

describe("LinkChecker", () => {
  it("passes when relative links resolve", () => {
    const fs = new FakeDocsFs({
      "/repo/docs/user/README.md": "x",
      "/repo/docs/user/init.md": "y",
    });
    const content = "See [init](init.md) and [back](README.md#top).";
    expect(new LinkChecker(fs).check("/repo/docs/user/README.md", content)).toEqual([]);
  });

  it("flags a broken relative link", () => {
    const fs = new FakeDocsFs({ "/repo/docs/user/README.md": "x" });
    const broken = new LinkChecker(fs).check("/repo/docs/user/README.md", "[gone](missing.md)");
    expect(broken).toHaveLength(1);
    expect(broken[0].target).toBe("missing.md");
  });

  it("skips external and in-page links", () => {
    const fs = new FakeDocsFs({ "/repo/docs/user/README.md": "x" });
    const content = "[ext](https://git-scm.com) [anchor](#section) [mail](mailto:a@b.c)";
    expect(new LinkChecker(fs).check("/repo/docs/user/README.md", content)).toEqual([]);
  });
});
