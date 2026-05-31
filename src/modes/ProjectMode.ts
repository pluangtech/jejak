import type { InitContext } from "../init/InitContext.js";
import type { JejakMode } from "../types.js";
import { VERSION } from "../version.js";
import type { ModeStrategy } from "./ModeStrategy.js";
import { ensureJejakDevDependency } from "./packageJson.js";

/**
 * Project mode: jejak is a devDependency; hooks (item 5) use a portable `npx jejak`. Run once
 * by the author, who commits package.json + .jejak/config.json so teammates just `npm install`.
 */
export class ProjectMode implements ModeStrategy {
  readonly mode: JejakMode = "project";

  async prepare(ctx: InitContext): Promise<void> {
    const { added } = ensureJejakDevDependency(ctx.repoRoot, VERSION);
    ctx.results.depAdded = added;
  }

  nextSteps(): string[] {
    return [
      "npm install   (installs the jejak devDependency)",
      "jejak setup --claude-code   (wire hooks), then commit package.json + .jejak/config.json",
    ];
  }

  /** Portable, committable invocation — teammates get it via `npm install`, no per-dev setup. */
  hookCli(): string {
    return "npx jejak";
  }
}
