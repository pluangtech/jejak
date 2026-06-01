import type { Reporter } from "../app/AppDeps.js";
import type { GitClient } from "../git/GitClient.js";
import { SHADOW_REF } from "../shadow/constants.js";
import type { SessionReader } from "./SessionReader.js";

export interface StatusOptions {
  json?: boolean;
}

/** Remote-tracking counterpart of the shadow ref, populated by `jejak fetch` (item 6c). */
const ORIGIN_REF = "refs/remotes/origin/jejak/sessions/v1";

/** `jejak status` — local vs origin state of the shadow ref. */
export async function runStatus(
  git: GitClient,
  reader: SessionReader,
  reporter: Reporter,
  opts: StatusOptions = {},
): Promise<void> {
  const initialized = await git.refExists(SHADOW_REF);
  if (!initialized) {
    if (opts.json) {
      reporter.line(JSON.stringify({ initialized: false }, null, 2));
    } else {
      reporter.line("shadow ref not initialized (run `jejak init`)");
    }
    reporter.flush();
    return;
  }

  const sessions = (await reader.list()).length;
  const pushed = await git.refExists(ORIGIN_REF);
  const ahead = pushed ? await git.revListCount(`${ORIGIN_REF}..${SHADOW_REF}`) : 0;
  const behind = pushed ? await git.revListCount(`${SHADOW_REF}..${ORIGIN_REF}`) : 0;

  if (opts.json) {
    reporter.line(JSON.stringify({ initialized: true, sessions, pushed, ahead, behind }, null, 2));
    reporter.flush();
    return;
  }

  reporter.line(`shadow ref: ${SHADOW_REF}`);
  reporter.line(`sessions captured: ${sessions}`);
  if (pushed) {
    reporter.line(`vs origin: ${ahead} ahead, ${behind} behind`);
  } else {
    reporter.line("not pushed yet — no origin tracking ref (run `jejak push`, item 6c)");
  }
  reporter.flush();
}
