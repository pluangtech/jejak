import { ensureJejakIgnore } from "../../workspace/WorkspaceFiles.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Ensure the working-tree `.jejakignore` exists (the only working-tree file init writes). */
export class WorkspaceFilesStep implements InitStep {
  readonly name = "workspace-files";

  async run(ctx: InitContext): Promise<void> {
    ctx.results.jejakignoreWritten = ensureJejakIgnore(ctx.repoRoot).written;
  }
}
