import { gunzipSync } from "node:zlib";
import { type GitClient, RealGitClient } from "../git/GitClient.js";
import { SHADOW_REF } from "../shadow/constants.js";
import { sessionPath } from "../shadow/sessionPath.js";

export interface DevReadFixtureOptions {
  handle: string;
  sessionId: string;
}

/**
 * Hidden `_dev read-fixture`: read a session's `events.jsonl.gz` back from the shadow ref and
 * write the decompressed narrative to `out`. The write→read round-trip proves the format.
 */
export async function devReadFixture(
  opts: DevReadFixtureOptions,
  git: GitClient = new RealGitClient(process.cwd()),
  out: (chunk: string) => void = (s) => process.stdout.write(s),
): Promise<void> {
  const path = `${sessionPath(opts.handle, opts.sessionId)}/events.jsonl.gz`;
  const gz = await git.catBlob(`${SHADOW_REF}:${path}`);
  out(gunzipSync(gz).toString("utf8"));
}
