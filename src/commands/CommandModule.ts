import type { Command } from "commander";
import type { AppDeps } from "../app/AppDeps.js";

/** A self-contained CLI verb. `cli.ts` just iterates the registry and calls register(). */
export interface CommandModule {
  readonly name: string;
  register(program: Command, deps: AppDeps): void;
}
