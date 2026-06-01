import type { Finding, PiiScanner, ScanResult } from "./PiiScanner.js";
import type { PiiPattern } from "./patterns.js";

/** Applies a pattern catalog: redacts every match to `[REDACTED-<type>]` and tallies findings. */
export class CatalogPiiScanner implements PiiScanner {
  constructor(private readonly patterns: PiiPattern[]) {}

  scan(content: string): ScanResult {
    let scrubbed = content;
    const findings: Finding[] = [];
    for (const p of this.patterns) {
      let count = 0;
      scrubbed = scrubbed.replace(p.regex, () => {
        count += 1;
        return `[REDACTED-${p.name}]`;
      });
      if (count > 0) findings.push({ type: p.name, severity: p.severity, count });
    }
    return { scrubbed, findings };
  }
}
