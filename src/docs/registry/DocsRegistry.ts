import { join } from "node:path";
import type { DocsFs } from "../DocsDeps.js";
import type { ConceptEntry, RegistryData, VerbEntry } from "./types.js";

/** Repository over the docs manifest (`docs/user/registry.json`). */
export class DocsRegistry {
  constructor(private readonly data: RegistryData) {}

  /** Load the manifest from `docs/user/registry.json` under `repoRoot`. */
  static load(fs: DocsFs, repoRoot: string): DocsRegistry {
    const path = join(repoRoot, "docs/user/registry.json");
    const parsed = JSON.parse(fs.readFile(path)) as Partial<RegistryData>;
    return new DocsRegistry({ verbs: parsed.verbs ?? [], concepts: parsed.concepts ?? [] });
  }

  shippedVerbs(): VerbEntry[] {
    return this.data.verbs.filter((v) => v.status === "shipped");
  }

  shippedConcepts(): ConceptEntry[] {
    return this.data.concepts.filter((c) => c.status === "shipped");
  }

  concepts(): ConceptEntry[] {
    return this.data.concepts;
  }
}
