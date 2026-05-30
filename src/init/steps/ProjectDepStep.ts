import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Delegate mode-specific preparation to the Strategy (project adds devDep; global no-op). */
export class ProjectDepStep implements InitStep {
  readonly name = "project-dep";

  async run(ctx: InitContext): Promise<void> {
    await ctx.mode?.prepare(ctx);
  }
}
