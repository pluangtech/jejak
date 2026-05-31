import type { JejakMode } from "../types.js";
import type { ModeStrategy } from "./ModeStrategy.js";

/**
 * Global mode: jejak is installed globally; hooks (item 5) embed the resolved absolute CLI
 * path per machine, so each developer runs `jejak setup` themselves. Fallback for non-Node repos.
 */
export class GlobalMode implements ModeStrategy {
  readonly mode: JejakMode = "global";

  async prepare(): Promise<void> {
    // no-op: nothing to add to a (possibly non-Node) repo
  }

  nextSteps(): string[] {
    return ["jejak setup --claude-code   (each developer runs this once)"];
  }

  /** Embed the resolved absolute path, shell-quoted (machine-specific; re-run setup --force after upgrade). */
  hookCli(absCliPath: string): string {
    return `'${absCliPath.replace(/'/g, "'\\''")}'`;
  }
}
