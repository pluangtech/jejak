import {
  detectAgents,
  findAdapter,
  supportedAdapters,
  validateAgentFlag,
} from "../../agents/registry.js";
import { InitError } from "../../errors.js";
import type { AgentId } from "../../types.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/**
 * Resolve the agent: `--agent` flag → re-init's existing choice → detect + interactive picker.
 * 1 supported detection is a confirm; 0/2+ (or a declined confirm) is a select among supported.
 */
export class ResolveAgentStep implements InitStep {
  readonly name = "resolve-agent";

  async run(ctx: InitContext): Promise<void> {
    if (ctx.flags.agent) {
      ctx.agent = findAdapter(validateAgentFlag(ctx.flags.agent));
      return;
    }
    if (ctx.existing?.agent) {
      ctx.agent = findAdapter(ctx.existing.agent);
      return;
    }

    if (!ctx.prompter.isInteractive) {
      throw new InitError("jejak: non-interactive shell; pass --agent claude-code");
    }

    const detected = detectAgents(ctx.repoRoot);
    const supportedDetected = detected.filter((d) => d.supported);

    if (supportedDetected.length === 1 && detected.length === 1) {
      const adapter = findAdapter(supportedDetected[0].id);
      const use = await ctx.prompter.confirm(
        `Detected ${adapter?.label} (${supportedDetected[0].matchedSignals[0]}). Use for jejak capture?`,
        true,
      );
      if (use) {
        ctx.agent = adapter;
        this.noteUnsupported(ctx, detected);
        return;
      }
    }

    const supported = supportedAdapters();
    const choice = await ctx.prompter.select<AgentId>(
      "Choose agent for jejak capture:",
      supported.map((a) => ({ name: `${a.label} (${a.id})`, value: a.id })),
    );
    ctx.agent = findAdapter(choice);
    this.noteUnsupported(ctx, detected);
  }

  private noteUnsupported(ctx: InitContext, detected: ReturnType<typeof detectAgents>): void {
    const unsupported = detected.filter((d) => !d.supported);
    if (unsupported.length > 0) {
      ctx.reporter.line(
        `note: detected unsupported agent(s): ${unsupported.map((d) => d.id).join(", ")}`,
      );
    }
  }
}
