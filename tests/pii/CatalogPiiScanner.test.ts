import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogPiiScanner } from "../../src/pii/CatalogPiiScanner.js";
import { loadCatalog } from "../../src/pii/loadCatalog.js";
import { BUILTIN_PATTERNS } from "../../src/pii/patterns.js";

const builtin = () => new CatalogPiiScanner(BUILTIN_PATTERNS);

describe("CatalogPiiScanner (built-in catalog)", () => {
  it("redacts each built-in secret type and never leaks the value", () => {
    const cases: Array<[string, string]> = [
      ["AKIAIOSFODNN7EXAMPLE", "aws-key"],
      ["Authorization: Bearer abcDEF123456_-=", "bearer-token"],
      ['API_KEY="abcd1234efgh5678ijkl"', "secret-assignment"],
      ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0", "jwt"],
    ];
    for (const [secret, type] of cases) {
      const out = builtin().scan(`prefix ${secret} suffix`);
      expect(out.scrubbed).toContain(`[REDACTED-${type}]`);
      expect(out.scrubbed).not.toContain(secret);
      expect(out.findings).toContainEqual(expect.objectContaining({ type, severity: "block" }));
    }
  });

  it("redacts a PEM private key block", () => {
    const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\ndef\n-----END OPENSSH PRIVATE KEY-----";
    const out = builtin().scan(pem);
    expect(out.scrubbed).toBe("[REDACTED-private-key]");
  });

  it("leaves clean content untouched (no findings)", () => {
    const out = builtin().scan("just a normal sentence with no secrets");
    expect(out.findings).toEqual([]);
    expect(out.scrubbed).toBe("just a normal sentence with no secrets");
  });

  it("does NOT redact email by default (opt-in only)", () => {
    expect(builtin().scan("ping me at dev@example.com").scrubbed).toContain("dev@example.com");
  });
});

describe("loadCatalog", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jejak-pii-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("uses built-ins when no pii.json exists", () => {
    const cat = loadCatalog(dir);
    expect(cat.ok).toBe(true);
    expect(cat.patterns).toHaveLength(BUILTIN_PATTERNS.length);
  });

  it("adds email opt-in and custom patterns from .jejak/pii.json", () => {
    mkdirSync(join(dir, ".jejak"), { recursive: true });
    writeFileSync(
      join(dir, ".jejak/pii.json"),
      JSON.stringify({
        redactEmail: true,
        patterns: [{ name: "internal-id", regex: "CUST-\\d{6}" }],
      }),
    );
    const scanner = new CatalogPiiScanner(loadCatalog(dir).patterns);
    const out = scanner.scan("user dev@example.com ref CUST-123456");
    expect(out.scrubbed).toContain("[REDACTED-email]");
    expect(out.scrubbed).toContain("[REDACTED-internal-id]");
  });

  it("is fail-safe: an unparseable pii.json keeps built-ins and flags ok:false", () => {
    mkdirSync(join(dir, ".jejak"), { recursive: true });
    writeFileSync(join(dir, ".jejak/pii.json"), "{ not json");
    const cat = loadCatalog(dir);
    expect(cat.ok).toBe(false);
    expect(cat.patterns).toHaveLength(BUILTIN_PATTERNS.length); // built-ins still scrub
  });
});
