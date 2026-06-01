import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PATTERNS, EMAIL_PATTERN, type PiiPattern } from "./patterns.js";

export interface Catalog {
  patterns: PiiPattern[];
  /** False only if `.jejak/pii.json` exists but failed to parse — the push hard-gate / doctor flag. */
  ok: boolean;
}

interface PiiConfig {
  redactEmail?: boolean;
  patterns?: Array<{ name?: unknown; regex?: unknown; severity?: unknown }>;
}

/**
 * Built-in catalog plus an optional, zero-dep `.jejak/pii.json` override (custom regex patterns +
 * email opt-in). Fail-safe: a bad file keeps the built-ins and flags `ok:false` (built-ins always
 * scrub, so secrets are never stored even when the override is broken).
 */
export function loadCatalog(repoRoot: string): Catalog {
  const patterns: PiiPattern[] = [...BUILTIN_PATTERNS];
  const path = join(repoRoot, ".jejak", "pii.json");
  if (!existsSync(path)) return { patterns, ok: true };

  try {
    const cfg = JSON.parse(readFileSync(path, "utf8")) as PiiConfig;
    if (cfg.redactEmail) patterns.push(EMAIL_PATTERN);
    for (const c of cfg.patterns ?? []) {
      if (typeof c.name !== "string" || typeof c.regex !== "string") continue;
      patterns.push({
        name: c.name,
        severity: c.severity === "warn" ? "warn" : "block",
        regex: new RegExp(c.regex, "g"),
      });
    }
    return { patterns, ok: true };
  } catch {
    return { patterns, ok: false }; // unparseable / bad regex → built-ins only, flagged
  }
}
