import { GlobalMode } from "../../modes/GlobalMode.js";
import { ProjectMode } from "../../modes/ProjectMode.js";
import { defaultMode, hasPackageJson, modeFor } from "../../modes/detectMode.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/**
 * Pick the distribution Strategy: explicit flag → re-init's existing mode → interactive
 * confirm (Node repo) → default by repo type.
 */
export class ResolveModeStep implements InitStep {
  readonly name = "resolve-mode";

  async run(ctx: InitContext): Promise<void> {
    if (ctx.flags.global) {
      ctx.mode = new GlobalMode();
      return;
    }
    if (ctx.flags.project) {
      ctx.mode = new ProjectMode();
      return;
    }
    if (ctx.existing?.mode) {
      ctx.mode = modeFor(ctx.existing.mode);
      return;
    }
    if (hasPackageJson(ctx.repoRoot) && ctx.prompter.isInteractive) {
      const choice = await ctx.prompter.select<"project" | "global">(
        "Add jejak as a project devDependency (recommended) or use a global install?",
        [
          { name: "Project devDependency (recommended)", value: "project" },
          { name: "Global install", value: "global" },
        ],
      );
      ctx.mode = choice === "global" ? new GlobalMode() : new ProjectMode();
      return;
    }
    ctx.mode = defaultMode(ctx.repoRoot);
  }
}
