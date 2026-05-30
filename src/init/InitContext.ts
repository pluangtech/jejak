import type { AgentAdapter } from "../agents/AgentAdapter.js";
import type { Reporter } from "../app/AppDeps.js";
import type { GitClient } from "../git/GitClient.js";
import type { ModeStrategy } from "../modes/ModeStrategy.js";
import type { Prompter } from "../prompt/Prompter.js";
import type { JejakConfig } from "../types.js";

/** Parsed `jejak init` flags. */
export interface InitFlags {
  agent?: string;
  project?: boolean;
  global?: boolean;
  /** Hidden override of the self-setup refusal (see GuardStep). */
  iKnowWhatImDoing?: boolean;
}

/** Accumulated outcomes used by SummaryStep. */
export interface InitResults {
  shadowCreated?: boolean;
  jejakignoreWritten?: boolean;
  depAdded?: boolean;
  agentChanged?: boolean;
}

/**
 * Mutable bag threaded through the init pipeline. Inputs (cwd, repoRoot, flags, existing) are
 * set up front; resolved fields (mode, agent, handle) and results are filled by steps.
 */
export interface InitContext {
  readonly cwd: string;
  readonly repoRoot: string;
  readonly flags: InitFlags;
  readonly existing: JejakConfig | null;
  mode?: ModeStrategy;
  agent?: AgentAdapter;
  handle?: string;
  readonly git: GitClient;
  readonly prompter: Prompter;
  readonly reporter: Reporter;
  readonly results: InitResults;
}
