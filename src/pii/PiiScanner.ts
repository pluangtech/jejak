export type PiiSeverity = "block" | "warn";

/** One pattern's redaction tally (no secret values — just type + count). */
export interface Finding {
  type: string;
  severity: PiiSeverity;
  count: number;
}

export interface ScanResult {
  /** Content with all matches replaced by `[REDACTED-<type>]`. */
  scrubbed: string;
  /** What was redacted (types + counts), for meta + doctor. */
  findings: Finding[];
}

/**
 * Best-effort secret/PII gate (DESIGN-LLD §9). Runs on staged content before the shadow-ref write.
 * v0.1 policy: **redact inline and keep the session** (mark captured-with-blocks) — never store a
 * secret, never silently drop the session.
 */
export interface PiiScanner {
  scan(content: string): ScanResult;
}

/** Pass-through scanner (tests / explicit opt-out). */
export class NoopPiiScanner implements PiiScanner {
  scan(content: string): ScanResult {
    return { scrubbed: content, findings: [] };
  }
}
