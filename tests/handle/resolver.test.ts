import { describe, expect, it } from "vitest";
import { InitError } from "../../src/errors.js";
import { resolveDevHandle } from "../../src/handle/HandleResolver.js";
import { FakeGitClient } from "../helpers/fakes.js";

describe("resolveDevHandle", () => {
  it("prefers repo jejak.handle", async () => {
    const git = new FakeGitClient("/repo", {
      config: { "jejak.handle": "Custom Handle", "user.name": "Aditya Jha" },
    });
    expect(await resolveDevHandle({ git })).toBe("custom-handle");
  });

  it("falls back to user.name slugified", async () => {
    const git = new FakeGitClient("/repo", { config: { "user.name": "Aditya Jha" } });
    expect(await resolveDevHandle({ git })).toBe("aditya-jha");
  });

  it("falls back to the email local-part", async () => {
    const git = new FakeGitClient("/repo", {
      config: { "user.email": "batu.aditya007@gmail.com" },
    });
    expect(await resolveDevHandle({ git })).toBe("batu.aditya007");
  });

  it("uses global jejak.handle before user.name", async () => {
    const git = new FakeGitClient("/repo", {
      config: { "user.name": "Aditya Jha" },
      globalConfig: { "jejak.handle": "team-alias" },
    });
    expect(await resolveDevHandle({ git })).toBe("team-alias");
  });

  it("throws InitError when nothing resolves", async () => {
    const git = new FakeGitClient("/repo");
    await expect(resolveDevHandle({ git })).rejects.toBeInstanceOf(InitError);
  });
});
