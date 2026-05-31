import { describe, expect, it } from "vitest";
import { type ClaudeSettings, mergeSettings } from "../../src/setup/settingsMerge.js";

describe("mergeSettings", () => {
  it("adds jejak's three agent hooks to fresh settings", () => {
    const { settings, changed } = mergeSettings(null, "npx jejak");
    expect(changed).toBe(true);
    expect(Object.keys(settings.hooks ?? {}).sort()).toEqual([
      "SessionEnd",
      "SessionStart",
      "Stop",
    ]);
    expect(settings.hooks?.SessionStart[0].hooks[0].command).toBe("npx jejak _hook session-start");
  });

  it("is idempotent — re-merging changes nothing", () => {
    const first = mergeSettings(null, "npx jejak").settings;
    const { changed } = mergeSettings(first, "npx jejak");
    expect(changed).toBe(false);
  });

  it("never clobbers a foreign hook — appends jejak alongside", () => {
    const existing: ClaudeSettings = {
      hooks: {
        SessionStart: [{ matcher: "", hooks: [{ type: "command", command: "other-tool --x" }] }],
      },
    };
    const { settings, changed } = mergeSettings(existing, "npx jejak");
    expect(changed).toBe(true);
    expect(settings.hooks?.SessionStart).toHaveLength(2);
    expect(settings.hooks?.SessionStart[0].hooks[0].command).toBe("other-tool --x"); // preserved
  });
});
