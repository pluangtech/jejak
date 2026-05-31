import { describe, expect, it } from "vitest";
import { CoverageChecker } from "../../src/docs/coverage/CoverageChecker.js";
import { DocsRegistry } from "../../src/docs/registry/DocsRegistry.js";
import type { RegistryData } from "../../src/docs/registry/types.js";
import { FakeDocsFs } from "../helpers/docsFakes.js";

const DATA: RegistryData = {
  verbs: [
    { name: "init", status: "shipped", page: "init.md" },
    { name: "push", status: "planned", page: "push.md" },
  ],
  concepts: [
    {
      id: "shadow-branch",
      title: "The shadow branch",
      status: "shipped",
      page: "concepts/shadow-branch.md",
      sources: [],
    },
  ],
};

describe("CoverageChecker", () => {
  it("passes when every shipped verb and concept has a page", () => {
    const fs = new FakeDocsFs({
      "/repo/docs/user/init.md": "x",
      "/repo/docs/user/concepts/shadow-branch.md": "y",
    });
    const problems = new CoverageChecker(fs, "/repo").check(new DocsRegistry(DATA));
    expect(problems).toEqual([]);
  });

  it("flags a shipped verb with no page", () => {
    const fs = new FakeDocsFs({ "/repo/docs/user/concepts/shadow-branch.md": "y" });
    const problems = new CoverageChecker(fs, "/repo").check(new DocsRegistry(DATA));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ kind: "verb", id: "init" });
  });

  it("ignores planned entries (only shipped is enforced)", () => {
    const fs = new FakeDocsFs({
      "/repo/docs/user/init.md": "x",
      "/repo/docs/user/concepts/shadow-branch.md": "y",
    });
    const problems = new CoverageChecker(fs, "/repo").check(new DocsRegistry(DATA));
    expect(problems.find((p) => p.id === "push")).toBeUndefined();
  });
});
