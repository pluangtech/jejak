import type { InitContext } from "../InitContext.js";

/** One stage of the init pipeline. Reads/mutates the context; throws InitError to abort. */
export interface InitStep {
  readonly name: string;
  run(ctx: InitContext): Promise<void>;
}
