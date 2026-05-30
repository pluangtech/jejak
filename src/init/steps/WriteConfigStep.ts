import { writeConfig } from "../../config/ConfigStore.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Write the committed `.jejak/config.json` ({v, agent, mode}); flag an agent change on re-init. */
export class WriteConfigStep implements InitStep {
  readonly name = "write-config";

  async run(ctx: InitContext): Promise<void> {
    const agent = ctx.agent?.id;
    const mode = ctx.mode?.mode;
    if (!agent || !mode)
      throw new Error("invariant: agent and mode must be resolved before WriteConfigStep");
    ctx.results.agentChanged = ctx.existing != null && ctx.existing.agent !== agent;
    writeConfig(ctx.repoRoot, { v: 1, agent, mode });
  }
}
