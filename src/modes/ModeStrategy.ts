import type { InitContext } from "../init/InitContext.js";
import type { JejakMode } from "../types.js";

/**
 * Strategy for the two distribution modes. Isolates everything that differs between a project
 * devDependency install and a global install (currently: devDep add, and next-step guidance).
 */
export interface ModeStrategy {
  readonly mode: JejakMode;
  /** Mode-specific side effects (project: add devDependency; global: no-op). */
  prepare(ctx: InitContext): Promise<void>;
  /** Mode-specific lines for the final "Next:" guidance. */
  nextSteps(ctx: InitContext): string[];
}
