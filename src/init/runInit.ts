import type { AppDeps } from "../app/AppDeps.js";
import { readConfig } from "../config/ConfigStore.js";
import { InitError } from "../errors.js";
import type { InitContext, InitFlags } from "./InitContext.js";
import { EnsureShadowRefStep } from "./steps/EnsureShadowRefStep.js";
import { GuardStep } from "./steps/GuardStep.js";
import type { InitStep } from "./steps/InitStep.js";
import { ProjectDepStep } from "./steps/ProjectDepStep.js";
import { ResolveAgentStep } from "./steps/ResolveAgentStep.js";
import { ResolveHandleStep } from "./steps/ResolveHandleStep.js";
import { ResolveModeStep } from "./steps/ResolveModeStep.js";
import { SummaryStep } from "./steps/SummaryStep.js";
import { WorkspaceFilesStep } from "./steps/WorkspaceFilesStep.js";
import { WriteConfigStep } from "./steps/WriteConfigStep.js";

/** The ordered init pipeline. Steps mutate the shared InitContext; any throws an InitError to abort. */
export const INIT_STEPS: InitStep[] = [
  new GuardStep(),
  new ResolveModeStep(),
  new ResolveAgentStep(),
  new ResolveHandleStep(),
  new WriteConfigStep(),
  new ProjectDepStep(),
  new EnsureShadowRefStep(),
  new WorkspaceFilesStep(),
  new SummaryStep(),
];

/** Orchestrate `jejak init`: resolve the repo root, build the context, run the pipeline. */
export async function runInit(
  flags: InitFlags,
  deps: AppDeps,
  steps: InitStep[] = INIT_STEPS,
): Promise<void> {
  let repoRoot: string;
  try {
    repoRoot = await deps.git.repoRoot();
  } catch {
    throw new InitError("jejak: not a git repository (run `git init` first)");
  }

  const ctx: InitContext = {
    cwd: process.cwd(),
    repoRoot,
    flags,
    existing: readConfig(repoRoot),
    git: deps.git,
    prompter: deps.prompter,
    reporter: deps.reporter,
    results: {},
  };

  for (const step of steps) {
    await step.run(ctx);
  }
  deps.reporter.flush();
}
