import type { InitContext } from "../../src/init/InitContext.js";
import { CollectingReporter, FakeGitClient, FakePrompter } from "./fakes.js";

/** Build an InitContext for step tests, with sensible fakes and per-test overrides. */
export function makeCtx(overrides: Partial<InitContext> & { repoRoot: string }): InitContext {
  return {
    cwd: overrides.repoRoot,
    repoRoot: overrides.repoRoot,
    flags: overrides.flags ?? {},
    existing: overrides.existing ?? null,
    git: overrides.git ?? new FakeGitClient(overrides.repoRoot),
    prompter: overrides.prompter ?? new FakePrompter(),
    reporter: overrides.reporter ?? new CollectingReporter(),
    results: overrides.results ?? {},
    mode: overrides.mode,
    agent: overrides.agent,
    handle: overrides.handle,
  };
}
