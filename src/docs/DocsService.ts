import type { DocsDeps } from "./DocsDeps.js";
import { CommandReferenceRenderer } from "./render/CommandReferenceRenderer.js";

/**
 * Facade over the docs layer. `scripts/*` and tests call these intent-named methods instead of
 * touching renderers/registries directly.
 */
export class DocsService {
  private readonly referenceRenderer = new CommandReferenceRenderer();

  constructor(private readonly deps: DocsDeps) {}

  /** Render the command reference (`docs/user/commands.md`) from the live CLI program. */
  generateReference(): string {
    return this.referenceRenderer.render(this.deps.buildProgram());
  }
}
