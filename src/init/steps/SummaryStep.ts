import { SHADOW_REF } from "../../shadow/constants.js";
import type { InitContext } from "../InitContext.js";
import type { InitStep } from "./InitStep.js";

/** Emit the final summary + mode-specific next steps. */
export class SummaryStep implements InitStep {
  readonly name = "summary";

  async run(ctx: InitContext): Promise<void> {
    const r = ctx.reporter;
    const untouched =
      ctx.existing != null &&
      !ctx.results.shadowCreated &&
      !ctx.results.jejakignoreWritten &&
      !ctx.results.depAdded &&
      !ctx.results.agentChanged;

    r.line(untouched ? "jejak: already initialized" : `jejak: initialized in ${ctx.repoRoot}`);
    r.line(`  agent:      ${ctx.agent?.id}`);
    r.line(`  mode:       ${ctx.mode?.mode}`);
    r.line(`  dev_handle: ${ctx.handle}`);
    r.line(`  shadow:     ${SHADOW_REF} (${ctx.results.shadowCreated ? "created" : "exists"})`);
    r.line("  config:     .jejak/config.json");
    if (ctx.results.jejakignoreWritten) r.line("  wrote:      .jejakignore");
    if (ctx.results.depAdded) r.line("  package.json: added jejak to devDependencies");
    if (ctx.results.agentChanged)
      r.line("  warning: agent changed — run `jejak setup --claude-code --force`");

    for (const step of ctx.mode?.nextSteps(ctx) ?? []) r.line(`Next: ${step}`);
  }
}
