import type { Reporter } from "../app/AppDeps.js";
import type { FetchAction, SyncRepository } from "./SyncRepository.js";

const MESSAGES: Record<FetchAction, string> = {
  none: "origin has no traces yet",
  adopt: "fetched origin's traces (first sync)",
  uptodate: "already up to date with origin",
  "fast-forward": "fast-forwarded to origin's traces",
  merge: "merged origin's traces into your local ref",
};

/** `jejak fetch` — pull origin's traces and merge them into the local shadow ref. */
export async function runFetch(sync: SyncRepository, reporter: Reporter): Promise<void> {
  const result = await sync.fetch();
  reporter.line(MESSAGES[result.action]);
  reporter.flush();
}
