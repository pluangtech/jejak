import { assertNotSelfSetup } from "../../guard.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/**
 * Refuse to initialize jejak inside its own development repo (hidden `--i-know-what-im-doing`
 * overrides). The git-work-tree check happens earlier in runInit (repoRoot resolution).
 */
export class GuardStep implements InitStep {
  readonly name = "guard";

  async run(ctx: InitContext): Promise<void> {
    assertNotSelfSetup(ctx.repoRoot, { iKnowWhatImDoing: ctx.flags.iKnowWhatImDoing });
  }
}
