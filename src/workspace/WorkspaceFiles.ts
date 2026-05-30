import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const JEJAKIGNORE = ".jejakignore";

/** Trace-content exclusions only (NOT git-ignore concerns). Written once; never clobbered. */
const JEJAKIGNORE_CONTENT = `# Jejak trace exclusions — file content never captured into traces. Extend as needed.
.env
.env.*
*.pem
*.key
id_rsa*
`;

/** Create `.jejakignore` if missing. Returns whether it was written. */
export function ensureJejakIgnore(repoRoot: string): { written: boolean } {
  const p = join(repoRoot, JEJAKIGNORE);
  if (existsSync(p)) return { written: false };
  writeFileSync(p, JEJAKIGNORE_CONTENT, "utf8");
  return { written: true };
}
