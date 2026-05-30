import { resolveDevHandle } from "../../handle/HandleResolver.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Resolve the dev-handle up front so resolution failure aborts before any side effects. */
export class ResolveHandleStep implements InitStep {
  readonly name = "resolve-handle";

  async run(ctx: InitContext): Promise<void> {
    ctx.handle = await resolveDevHandle({ git: ctx.git });
  }
}
