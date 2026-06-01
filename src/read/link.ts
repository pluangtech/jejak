import type { Reporter } from "../app/AppDeps.js";
import type { GitClient } from "../git/GitClient.js";

export interface LinkOptions {
  json?: boolean;
}

const TRAILER = /^Jejak-Session:\s*(.+?)\s*$/gm;

/** Extract every `Jejak-Session: <id>` trailer from a commit message body. */
export function parseSessionTrailers(body: string): string[] {
  const ids: string[] = [];
  for (const m of body.matchAll(TRAILER)) ids.push(m[1]);
  return ids;
}

/** `jejak link <sha>` — list the session id(s) a commit is linked to via its trailers. */
export async function runLink(
  git: GitClient,
  reporter: Reporter,
  sha: string,
  opts: LinkOptions = {},
): Promise<void> {
  const body = await git.logBody(sha);
  const sessions = body ? parseSessionTrailers(body) : [];

  if (opts.json) {
    reporter.line(JSON.stringify({ sha, sessions }, null, 2));
    reporter.flush();
    return;
  }

  if (sessions.length === 0) {
    reporter.line(`no jejak sessions linked to ${sha}`);
  } else {
    for (const id of sessions) reporter.line(id);
  }
  reporter.flush();
}
