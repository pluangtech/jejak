/** Lifecycle of a documented surface. Only `shipped` entries are coverage-enforced. */
export type DocStatus = "shipped" | "planned";

/** A public verb's documentation entry. */
export interface VerbEntry {
  name: string;
  status: DocStatus;
  /** Page path relative to `docs/user/`. */
  page: string;
}

/** A concept (explanation page) entry, bound to the sources it's derived from. */
export interface ConceptEntry {
  id: string;
  title: string;
  status: DocStatus;
  /** Page path relative to `docs/user/`. */
  page: string;
  /** Source files (repo-root-relative) this concept is derived from; drives freshness checks. */
  sources: string[];
}

/** The single docs manifest (`docs/user/registry.json`) — verbs + concepts in one place. */
export interface RegistryData {
  verbs: VerbEntry[];
  concepts: ConceptEntry[];
}
