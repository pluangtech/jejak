import { describe, expect, it } from "vitest";
import {
  PRE_PUSH_MARKER,
  PUSH_GUARD_ENV,
  SHADOW_REF_NS,
  renderPrePushGuard,
} from "../../src/git/pushGuard.js";

describe("renderPrePushGuard", () => {
  const hook = renderPrePushGuard();

  it("is a bash script carrying the jejak marker", () => {
    expect(hook.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(hook).toContain(PRE_PUSH_MARKER);
  });

  it("lets jejak's own push through via the handshake env var", () => {
    expect(hook).toContain(`if [ -n "$${PUSH_GUARD_ENV}" ]; then exit 0; fi`);
  });

  it("matches the shadow namespace across both ref columns", () => {
    expect(hook).toContain('case "$local_ref$remote_ref" in');
    expect(hook).toContain(`*${SHADOW_REF_NS}*`);
  });

  it("namespace matches refs/heads, --mirror's refs/remotes path, and archive refs", () => {
    for (const ref of [
      "refs/heads/jejak/sessions/v1",
      "refs/remotes/origin/jejak/sessions/v1",
      "refs/heads/jejak/sessions/v1-archive-2026-Q1",
      "refs/heads/jejak/sessions/v2",
    ]) {
      expect(ref.includes(SHADOW_REF_NS)).toBe(true);
    }
    expect("refs/heads/main".includes(SHADOW_REF_NS)).toBe(false);
  });
});
