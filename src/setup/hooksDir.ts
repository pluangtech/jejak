import { isAbsolute, join } from "node:path";
import type { GitClient } from "../git/GitClient.js";

/**
 * Resolve the directory git actually reads hooks from. When `core.hooksPath` is set (e.g. husky),
 * git IGNORES `.git/hooks/` — so a hook written there never runs. Honoring it keeps the
 * `prepare-commit-msg` and `pre-push` guards effective in those repos. When unset (the common
 * case) this returns `<repoRoot>/.git/hooks`, identical to the previous hardcoded path.
 */
export async function resolveHooksDir(git: GitClient, repoRoot: string): Promise<string> {
  const configured = await git.getConfig("core.hooksPath");
  if (configured) return isAbsolute(configured) ? configured : join(repoRoot, configured);
  return join(repoRoot, ".git", "hooks");
}
