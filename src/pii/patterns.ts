import type { PiiSeverity } from "./PiiScanner.js";

export interface PiiPattern {
  name: string;
  severity: PiiSeverity;
  /** Global regex (the catalog scanner replaces every match). */
  regex: RegExp;
}

/**
 * v0.1 built-in catalog (DESIGN-LLD §9) — all block-severity secrets. Email is a separate
 * opt-in warn pattern (off unless `.jejak/pii.json` sets `redactEmail`).
 */
export const BUILTIN_PATTERNS: PiiPattern[] = [
  { name: "aws-key", severity: "block", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: "private-key",
    severity: "block",
    regex:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    name: "bearer-token",
    severity: "block",
    regex: /Authorization:\s*Bearer\s+[A-Za-z0-9+/_=-]+/gi,
  },
  {
    name: "secret-assignment",
    severity: "block",
    regex: /\b(?:SECRET|TOKEN|KEY|PASSWORD|API_KEY)\b\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{16,}['"]?/gi,
  },
  {
    name: "jwt",
    severity: "block",
    regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
];

/** Opt-in (warn): redact email addresses when `.jejak/pii.json` sets `redactEmail: true`. */
export const EMAIL_PATTERN: PiiPattern = {
  name: "email",
  severity: "warn",
  regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
};
