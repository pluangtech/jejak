---
name: docs-drift
description: Audit jejak's user-facing docs (docs/user/) for semantic drift that the deterministic CI guards (coverage, reference freshness, source-binding hashes, link check) cannot catch — prose that contradicts CLI-SPEC.md or the code, shipped surfaces with no page, and stale third-party links. Use on demand when a verb/concept changes, or automatically (Stop hook) to surface drift. Tier 3 of the docs system; Tiers 1-2 live in src/docs/ + tests/docs/.
---

# docs-drift

Validates the **semantic correctness** of `docs/user/` — the layer machines can't guarantee.
Tiers 1–2 (generate + deterministic guards) already prove the docs are *structurally present,
fresh-by-hash, linked, and runnable*. This skill judges whether the **prose is true**.

It does **not** re-run the deterministic checks (that's `pnpm docs:check` / `tests/docs/`). It does
**not** edit `commands.md` (generated). It reports findings; the caller decides what to apply.

## Inputs
- `$1` (optional): a concept id, verb name, or page path to focus on. If omitted, audit all of
  `docs/user/`.

## What it knows about the system
- Source of truth for **behaviour** is `docs/CLI-SPEC.md`; `docs/user/` is task-oriented prose for
  end users. They must not contradict.
- The docs manifest is `docs/user/registry.json` (verbs + concepts, each with `status` and, for
  concepts, `sources`).
- Concept pages carry frontmatter `sources_hash`; a mismatch means a bound source changed since the
  page was last reviewed (CI flags this — see "Adjudication" below).

## Procedure
1. **Read** the manifest, `CLI-SPEC.md`, and the page(s) in scope.
2. **Discovery** — scan `src/` and `CLI-SPEC.md` for surfaces with no page:
   - a verb whose status is (or should be) `shipped` with no `docs/user/<verb>.md`;
   - a concept-bearing area (e.g. `src/shadow/`, `src/pii_scanner.ts`, `src/session_ledger.ts`,
     `src/handle/`) or a glossary term with no concept page.
   Propose a registry entry + page (don't invent behaviour — derive from the sources).
3. **Consistency** — compare each page's claims against `CLI-SPEC.md` and the bound `sources`.
   Flag contradictions with `file:line` on both sides (e.g. page says "creates a branch" but the
   code creates an orphan ref).
4. **Adjudication** — for any page whose `sources_hash` is stale (run `pnpm docs:check` to see
   which), decide: does the prose actually need to change?
   - If yes → propose the prose edit.
   - If no (the source change didn't affect meaning) → instruct re-stamping the hash deliberately
     (re-run the recorded hash; never auto-refresh as a side effect of `docs:gen`).
5. **Third-party links** — flag external links that are dead or point at a moved/renamed page
   (the deterministic check only covers *internal* links).

## Output
Group findings under **Missing pages**, **Contradictions**, **Stale (needs review)**, and
**Link rot**. For each: `page · what's wrong · evidence (file:line both sides) · proposed fix`.
End with a count. Report only unless the caller asked to apply fixes.

## Grading discipline (deterministic-ish — same inputs, same findings)
- A **finding** requires concrete evidence (a quoted contradiction, a missing file, a dead URL).
  "Could be clearer" is a NOTE, not a finding.
- Never flag the generated `commands.md` for prose issues — it's derived.
- If a claim can't be verified against a source or the spec, say so explicitly rather than guessing.
