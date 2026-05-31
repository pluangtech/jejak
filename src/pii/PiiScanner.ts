export interface ScanResult {
  /** True if the content must NOT be written to the shared ref (unrecoverable secret). */
  blocked: boolean;
  /** Content with warn-level matches scrubbed (identical to input for the Noop scanner). */
  scrubbed: string;
}

/**
 * Best-effort secret/PII gate (DESIGN-LLD §9). The capture worker runs `scan` on staged content
 * before the shadow-ref write. Item 5 injects {@link NoopPiiScanner}; item 6 implements the real
 * 6-pattern catalog + `.jejak/pii.yaml` and the push hard-gate.
 */
export interface PiiScanner {
  scan(content: string): ScanResult;
}

/** No-op scanner for item 5 — passes everything through. Capture stays local (never pushed) until item 6. */
export class NoopPiiScanner implements PiiScanner {
  scan(content: string): ScanResult {
    return { blocked: false, scrubbed: content };
  }
}
