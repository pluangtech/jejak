import { describe, expect, it } from "vitest";
import { ExampleExtractor } from "../../src/docs/examples/ExampleExtractor.js";

const extractor = new ExampleExtractor();

describe("ExampleExtractor", () => {
  it("extracts commands only from tagged blocks", () => {
    const md = [
      "Untagged:",
      "```console",
      "$ jejak should-not-run",
      "```",
      "",
      "Tagged:",
      "<!-- run -->",
      "```console",
      "$ jejak --version",
      "$ jejak init",
      "```",
    ].join("\n");

    const examples = extractor.extract(md);
    expect(examples).toHaveLength(1);
    expect(examples[0].commands).toEqual(["jejak --version", "jejak init"]);
  });

  it("allows a blank line between the marker and the fence", () => {
    const md = ["<!-- run -->", "", "```console", "$ jejak --version", "```"].join("\n");
    expect(extractor.extract(md)[0].commands).toEqual(["jejak --version"]);
  });

  it("ignores non-command lines inside a tagged block", () => {
    const md = ["<!-- run -->", "```console", "$ jejak --version", "0.1.0-dev", "```"].join("\n");
    expect(extractor.extract(md)[0].commands).toEqual(["jejak --version"]);
  });

  it("returns nothing when there are no tagged blocks", () => {
    expect(extractor.extract("# just prose\n\nsome text")).toEqual([]);
  });
});
