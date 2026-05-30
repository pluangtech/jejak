import { describe, expect, it } from "vitest";
import { slugify } from "../../src/handle/slugify.js";

describe("slugify", () => {
  it("slugifies a typical name", () => {
    expect(slugify("Aditya Jha")).toBe("aditya-jha");
  });

  it("collapses whitespace and separators to single dashes", () => {
    expect(slugify("  Foo   Bar+Baz/Qux ")).toBe("foo-bar-baz-qux");
  });

  it("strips email-ish separators", () => {
    expect(slugify("batu.aditya007")).toBe("batu.aditya007");
    expect(slugify("a@b\\c:d")).toBe("a-b-c-d");
  });

  it("returns null for empty / separator-only input", () => {
    expect(slugify("")).toBeNull();
    expect(slugify(null)).toBeNull();
    expect(slugify("   ")).toBeNull();
    expect(slugify("@@@")).toBeNull();
  });

  it("caps at 64 chars without a trailing dash", () => {
    const out = slugify(`${"a".repeat(70)} b`);
    expect(out).not.toBeNull();
    expect((out as string).length).toBeLessThanOrEqual(64);
    expect(out as string).not.toMatch(/-$/);
  });
});
