import { ShadowRepository } from "../../shadow/ShadowRepository.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Idempotently bootstrap the orphan shadow ref + seed tree (never checks it out). */
export class EnsureShadowRefStep implements InitStep {
  readonly name = "ensure-shadow-ref";

  async run(ctx: InitContext): Promise<void> {
    const { created } = await new ShadowRepository(ctx.git).ensure();
    ctx.results.shadowCreated = created;
  }
}
