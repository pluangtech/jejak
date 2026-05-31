# Docs Implementation Plan — User-Facing Documentation Layer (item 4.5)

**Status:** implemented (Tiers 1–4); `/validate-plan` → 0 GAPs.

> **Build revision:** the two registries described in §2/§7 (`concepts.json` + `_meta.json`) were
> folded into a **single manifest** `docs/user/registry.json` (verbs + concepts, each with `status`
> and — for concepts — `sources`), per the "one manifest" decision taken during the build.
**Implements:** [IMPLEMENTATION-ORDER.md §4.5](../IMPLEMENTATION-ORDER.md) — "User-facing documentation layer"
**Design sources:** [CLI-SPEC.md](../CLI-SPEC.md) · [DESIGN-LLD.md](../DESIGN-LLD.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) · [IMPLEMENTATION-ORDER.md](../IMPLEMENTATION-ORDER.md)
**Supersedes scope of:** IMPLEMENTATION-ORDER.md §4.5 "Where/How" (see §11 — locked-decision changes this plan forces)

---

## 0. Design patterns used (the vocabulary this plan speaks)

Pattern-based, single-responsibility, god-file-free — same discipline as
[INIT-IMPLEMENTATION-PLAN-v2.md §0](INIT-IMPLEMENTATION-PLAN-v2.md).

| Pattern | Where | Why |
|---|---|---|
| **Builder** | reuse `src/commands/index.ts` (`buildProgram`) | The generated reference is rendered from the *same* commander program users run — one source of truth |
| **Strategy** | `src/docs/render/*Renderer.ts` | One renderer per page type (command-reference vs concept-page); add page types without touching callers |
| **Repository** | `src/docs/concepts/ConceptRegistry.ts` | Reads/writes the concept manifest behind an interface; fakeable in tests |
| **Facade** | `src/docs/DocsService.ts` | Hides gen / coverage / freshness orchestration behind a typed API; `scripts/*` and tests call this, not internals |
| **Value Object** | `src/docs/model/*.ts` (`ConceptId`, `SourceBinding`, `DocPage`) | Immutable, validated identifiers; no stringly-typed concept ids |
| **Dependency Injection** | `src/docs/DocsDeps.ts` + `createDocsDeps.ts` | Inject `fs`, `git`, `clock`, `program` so unit tests use fakes — no real git/TTY/FS |
| **Command (hidden)** | `src/dev/docs.ts` → `jejak _dev docs <gen\|check>` | Mirrors existing `src/dev/*` hidden dev verbs; thin wrapper over `DocsService` |

> No new **public** verb. `docs:gen`/`docs:check` are dev/CI entry points (npm scripts +
> hidden `_dev docs`), exactly like `_dev strip` / `_dev write-fixture`. This keeps the
> verb-coverage bijection ([IMPLEMENTATION-ORDER.md §2](../IMPLEMENTATION-ORDER.md)) intact.

---

## 1. The problem, and the four-tier model

Docs rot in three distinct ways, and one tool cannot fix all three. We split by *kind of drift*
and map each tier to the **Diátaxis** quadrants (the model Django/Cloudflare/Gatsby docs use):

| Tier | Diátaxis quadrant | Drift kind | Mechanism | Can a machine guarantee it? |
|---|---|---|---|---|
| **1 — Generate** | Reference | CLI ↔ doc mismatch | render `commands.md` from the live program | **Yes** — derived, no second source |
| **2 — Guard** | (all) | missing page / stale generated file / dead link / broken example | deterministic CI tests | **Yes** — structural |
| **3 — Audit** | Explanation, How-to | prose that *lies* / missing concept page | `docs-drift` skill (LLM judgment) + auto hook | **No** — needs judgment, but bounded by Tier-2 hashes |
| **0 — Publish** | (all) | — | VitePress site over `docs/user/` | n/a |

**Why Tier 3 is unavoidable.** Explanation pages ("what is the shadow branch, why it exists, how
to use it, examples, further reading") are prose *about concepts*, not commands — they cannot be
generated. Concepts also don't map 1:1 to verbs (the shadow branch spans `init`/`push`/`fetch`;
"dev-handle" maps to no verb). So they need their own coverage + freshness machinery (§7), and the
authoring/judgment lives in a skill.

---

## 2. Directory layout

```
docs/user/                      ← single source of truth (markdown-in-repo), shipped in git
├── README.md                   tutorial / 5-min getting-started
├── guides/                     how-to (task-oriented)
│   └── .gitkeep                (first guide lands with item 5: "capture your first trace")
├── concepts/                   explanation (understanding-oriented)
│   └── shadow-branch.md        first concept (item 4 shipped it)
├── commands.md                 GENERATED reference (never hand-edited)
├── concepts.json               concept registry: coverage + source bindings (§7)
└── _meta.json                  page→verb / page→shipped-status map for the coverage guard

docs-site/                      ← dev-only; NOT in package.json "files" (not published to npm)
├── .vitepress/config.ts        srcDir → ../docs/user  (no copies; renders the source directly)
└── package note               (see §6)

scripts/
├── expected-verbs.json         (existing)
└── docs-gen.ts                 thin: buildProgram() → DocsService.generate() → write commands.md

src/docs/                       ← all logic (testable, pure where possible)
├── DocsDeps.ts                 DI seam (fs, git, clock, program)
├── createDocsDeps.ts           real wiring
├── DocsService.ts              Facade: generate(), checkCoverage(), checkFreshness(), checkLinks()
├── model/
│   ├── ConceptId.ts            Value Object
│   ├── SourceBinding.ts        Value Object (path + anchor + recorded hash)
│   └── DocPage.ts              parsed page (frontmatter + body + fenced examples)
├── render/
│   ├── PageRenderer.ts         Strategy interface
│   ├── CommandReferenceRenderer.ts
│   └── ConceptPageRenderer.ts  (template scaffold for new concept pages)
├── concepts/
│   └── ConceptRegistry.ts      Repository over concepts.json
├── coverage/
│   └── CoverageChecker.ts      verb↔page  AND  concept↔page bijections
├── freshness/
│   └── SourceHasher.ts         hash bound sources; compare to recorded; flag drift
├── examples/
│   └── ExampleExtractor.ts     pull fenced ```console blocks tagged for execution
└── links/
    └── LinkChecker.ts          internal-link resolution (+ optional external)

src/dev/
└── docs.ts                     hidden `jejak _dev docs <gen|check>` (mirrors _dev strip)

tests/
├── docs/
│   ├── CommandReferenceRenderer.test.ts   unit, fake program
│   ├── CoverageChecker.test.ts            unit, in-memory registry + fake fs
│   ├── SourceHasher.test.ts               unit, fake fs (drift vs no-drift)
│   ├── ExampleExtractor.test.ts           unit, sample markdown
│   └── docs-coverage.test.ts              the CI guard (orchestrates the above on real docs/user)
└── integration/
    └── docs-examples.git.test.ts          runs getting-started examples vs built CLI in a tmp repo
```

---

## 3. Tier 1 — Generate (Reference)

- `CommandReferenceRenderer` consumes the commander program produced by the existing
  `buildProgram()` in `src/commands/index.ts` (Builder reuse) and emits `commands.md`:
  per public command → name, summary, args, options, `--help` text. Hidden `_hook`/`_dev` excluded
  (same filter as `expected-verbs.json`).
- `scripts/docs-gen.ts` (npm script `docs:gen`) writes the file. `_dev docs gen` is the CLI twin.
- **Property that kills this drift class:** there is no hand-maintained reference. If the CLI
  changes, regenerating changes the doc; CI (Tier 2) fails if someone forgets to regenerate.
- Prior art: `oclif readme`, Cobra `GenMarkdownTree`, `sphinx-click`.

---

## 4. Tier 2 — Guard (deterministic CI)

`tests/docs/docs-coverage.test.ts` — mirrors the existing `tests/verb-coverage.test.ts` pattern:

1. **Verb coverage** — every **shipped** public verb (status in `_meta.json`) has
   `docs/user/<verb>.md`. Today: only `init`.
2. **Concept coverage** — every **shipped** concept in `concepts.json` has
   `docs/user/concepts/<id>.md`. Today: `shadow-branch`.
3. **Reference freshness** — `commands.md` byte-equals a fresh `DocsService.generate()`
   (fails if stale).
4. **Source-binding freshness** — for each concept page, recompute the hash of its bound sources;
   if a source changed but the page's recorded hash didn't → fail "possibly stale, re-review" (§7).
5. **Link check** — internal links resolve (`LinkChecker`); external links checked in a separate,
   network-gated job (non-blocking locally, scheduled in CI) to avoid flakiness.
6. **Executable examples** — `ExampleExtractor` pulls fenced ```` ```console ```` blocks tagged
   `<!-- run -->` from `docs/user/*.md`; `docs-examples.git.test.ts` runs them against the built CLI
   in a throwaway tmp git repo and **asserts exit codes**. This is the copy-paste path users hit.
   Prior art: Rust doctests, `mdbook test`, Python `doctest`.

`docs:check` (npm script + `_dev docs check`) runs 1–5 and **exits non-zero on any drift** (CI gate).

---

## 5. Tier 3 — Audit (`docs-drift` skill + auto hook)

A project skill `.claude/skills/docs-drift/SKILL.md`, in the `plan-*` / `validate-plan` family.
It does only what judgment is required for; everything mechanical stays in Tiers 1–2.

**Responsibilities:**
- **Discovery** — scan changed `src/` + `CLI-SPEC.md`/`DESIGN-LLD.md` for concepts with no
  registry entry; *propose* additions ("`src/pii_scanner.ts` shipped, no `pii-gate` concept page").
- **Authoring/update** — draft or revise concept pages from bound sources using the fixed template
  *(What it is · Why it exists · How to use it + examples · Further reading / third-party links)*.
- **Adjudication** — for Tier-2 "possibly stale" flags, decide whether the prose actually needs
  changing; if not, refresh the recorded hash (§7).
- **Consistency** — report `docs/user/` prose that contradicts `CLI-SPEC.md` with `file:line`
  (same idea as `plan-docs-consistency`, pointed at user docs).

**Decision table (how the process is "smart"):**

| Trigger | Detected by | Action | Owner |
|---|---|---|---|
| CLI flags/help changed | `docs:gen` diff | regenerate `commands.md` | deterministic |
| New shipped verb, no page | CoverageChecker (CI red) | create `<verb>.md` | drift skill drafts |
| New concept-bearing module / glossary term | drift skill scan | propose registry entry + page | drift skill |
| Bound source changed, page didn't | SourceHasher (CI red) | re-review; update prose or refresh hash | CI flags, skill adjudicates |
| Dead internal link | LinkChecker (CI red) | fix link | deterministic |
| Prose contradicts CLI-SPEC | drift skill | report `file:line` | drift skill |

**Auto wiring (decision: skill + auto hook now).** A Claude Code **Stop hook** in the *committed*
`.claude/settings.json` runs the skill on demand and after sessions, surfacing drift unprompted.

> ⚠️ **Not a jejak capture hook.** [IMPLEMENTATION-ORDER.md §0 "No self-capture invariant"](../IMPLEMENTATION-ORDER.md)
> forbids *jejak* hooks in this repo. The `docs-drift` Stop hook is a Claude Code agent hook
> unrelated to jejak capture — it does not register `jejak _hook …`, write `.jejak/`, or touch the
> shadow ref. The plan calls this out so the invariant check (and any future reader) doesn't trip.

---

## 6. Tier 0 — Publish (VitePress, separate `docs-site/`)

- `vitepress` as a **devDependency**; `docs-site/` is **dev-only** and excluded from npm `files`.
- `.vitepress/config.ts` sets **`srcDir: ../docs/user`** — the site renders the source markdown
  directly. **No copies** → eliminates the "two trees drift" risk the layout choice warned about.
- Scripts: `docs:site:dev` (preview), `docs:site:build` (static build).
- A GitHub Pages workflow is scaffolded but **left disabled** until v0.1 tag (no premature publish).

---

## 7. The concept registry + source-binding hashes (the core mechanism)

`docs/user/concepts.json` — declared concepts, mirroring `scripts/expected-verbs.json`:

```jsonc
{
  "concepts": [
    {
      "id": "shadow-branch",
      "title": "The shadow branch",
      "status": "shipped",
      "sources": ["DESIGN-LLD.md#10", "src/shadow/ShadowRepository.ts", "src/shadow_branch.ts"]
    }
  ]
}
```

Each concept page's frontmatter records the hash of its bound sources at last review:

```yaml
---
concept: shadow-branch
sources_hash: "sha256:…"   # hash over the bound source files/anchors at last review
reviewed_at: "<git-sha>"
---
```

- **CI (deterministic):** recompute `sources_hash`; mismatch ⇒ "possibly stale" failure. This
  promotes a large slice of explanation-drift from "hope an LLM notices" to "CI catches it."
- **Skill (judgment):** on a flag, decide whether prose needs changing; if genuinely unaffected,
  refresh the hash. New concepts are *proposed* by the skill, *enforced* by CoverageChecker.

This is the answer to "make the process smart": **bind docs to their source of truth, hash the
binding, let CI flag and the skill adjudicate.**

---

## 8. Testing strategy (plan-testability)

- **Unit (no real git/TTY/FS):** renderers (fake program), CoverageChecker (in-memory registry +
  fake fs), SourceHasher (fake fs: drift and no-drift cases), ExampleExtractor (sample markdown),
  LinkChecker (in-memory tree). All via `DocsDeps` fakes.
- **Integration (isolated):** `docs-examples.git.test.ts` builds the CLI and runs getting-started
  examples in a **tmpdir git repo** — never the real repo, never the shadow ref.
- **Exit codes asserted:** `docs:check` and `_dev docs check` return non-zero on each drift class;
  tests assert the specific code per failure path (missing page, stale ref, stale hash, dead link,
  failed example).
- **Failure paths covered:** delete a shipped verb's page → red; edit a bound source → "stale" red;
  hand-edit `commands.md` → freshness red; break an example → red. (These are the §4.5 test-project
  checklist steps, encoded as automated tests.)

---

## 9. Distribution & onboarding impact (plan-distribution)

- `docs/user/**` is **committed** (shared, not per-developer) and ships in the repo.
- `docs-site/` + `vitepress` are **dev-only** (excluded from npm `files`); end users `npm i -g jejak`
  get the CLI, not the site toolchain.
- The `docs-drift` Stop hook lives in **committed** `.claude/settings.json` (team-shared), with a
  portable command string (no absolute machine paths) — consistent with the committed-vs-per-developer
  config split.
- No per-developer install/init step is added; `pnpm docs:gen` / `pnpm docs:check` run in CI and
  locally with the existing toolchain.

---

## 10. Git safety (plan-git-safety)

- The docs layer performs **no ref/commit/tree writes** of its own.
- The only git interaction is the executable-examples integration test, which operates exclusively
  in throwaway tmpdir repos: it **never checks out the shadow ref**, never writes
  `refs/heads/jejak/*`, and never runs against the real repo. (Most examples are read-only:
  `git show-ref`, `git cat-file -p`.)

---

## 11. Docs-consistency — locked-decision changes this plan forces (plan-docs-consistency)

This plan changes decisions recorded in the design docs; per the guardrail it must list the updates
rather than silently contradict them. **All of these are part of "Done when":**

1. **IMPLEMENTATION-ORDER.md §4.5 "Where"** currently says *"markdown-in-repo, **no doc-site tooling
   in v0.1**."* → Replace: VitePress site in `docs-site/` (dev-only, srcDir → `docs/user/`).
2. **IMPLEMENTATION-ORDER.md §4.5 scope/Done-when** — extend beyond `README.md`+`init.md`+
   `commands.md`+coverage test to the four-tier model: Diátaxis `concepts/`+`guides/`, concept
   registry + source-binding freshness, executable examples, `docs-drift` skill + Stop hook,
   `docs-site/`.
3. **IMPLEMENTATION-ORDER.md Modus operandi §3** — already amended ("Docs are part of done") in the
   working tree; this plan keeps it and adds: *items also satisfy concept-coverage*, not only
   verb-coverage.
4. **CLI-SPEC.md** — add a one-line pointer that end-user docs live in `docs/user/` and that
   `CLI-SPEC.md` remains the behaviour contract (no contradiction; clarifies the source-of-truth
   split).
5. **No contradiction with resolved review findings.** This plan introduces no behaviour change to
   the CLI; it adds a documentation layer. Cross-check: no R-n / CR / IM finding in
   IMPLEMENTATION-ORDER or REVIEW-LLD* concerns documentation behaviour that this would reverse.

---

## 12. Build order (single PR, item 4.5)

1. `src/docs/` model + DI seam + renderers (Tier 1) + `scripts/docs-gen.ts` + `docs:gen` script.
2. `docs/user/README.md`, `docs/user/init.md`, generate `commands.md`.
3. `ConceptRegistry` + `concepts.json` + `docs/user/concepts/shadow-branch.md` (first concept).
4. Tier 2: `CoverageChecker`, `SourceHasher`, `ExampleExtractor`, `LinkChecker`, `docs-coverage.test.ts`,
   `docs-examples.git.test.ts`; `docs:check` script; CI wiring.
5. `docs-drift` skill + committed `.claude/settings.json` Stop hook.
6. `docs-site/` VitePress (dev-only) + scripts; disabled Pages workflow.
7. §11 doc updates (IMPLEMENTATION-ORDER §4.5, Modus operandi, CLI-SPEC pointer).

---

## 13. Done when

- [ ] `docs/user/README.md` (getting-started) + `docs/user/init.md` (shipped verb)
- [ ] `docs/user/concepts/shadow-branch.md` (first concept, bound + hashed)
- [ ] `pnpm docs:gen` + generated `docs/user/commands.md` (clean regen, no diff)
- [ ] `concepts.json` + `_meta.json` registries
- [ ] `tests/docs/docs-coverage.test.ts` green: verb-coverage, concept-coverage, reference freshness,
      source-binding freshness, internal links
- [ ] `tests/integration/docs-examples.git.test.ts` green: getting-started examples run, exit codes asserted
- [ ] `pnpm docs:check` exits non-zero on each injected drift class (failure-path tests)
- [ ] `docs-drift` skill + committed `.claude/settings.json` Stop hook (not a jejak capture hook)
- [ ] `docs-site/` VitePress builds (`pnpm docs:site:build`); Pages workflow scaffolded + disabled
- [ ] §11 doc updates applied; `/validate-plan` green; user sign-off
- [ ] Test-project checklist ([IMPLEMENTATION-ORDER.md §4.5](../IMPLEMENTATION-ORDER.md)) passes

---

## 14. Open questions

- **External-link checking cadence** — block PRs, or scheduled-only (proposed: scheduled-only to
  avoid network flakiness; internal links block PRs).
- **Concept-bearing path list** — which `src/` dirs the drift skill treats as concept sources
  (proposed seed: `src/shadow/`, `src/pii_scanner.ts`, `src/session_ledger.ts`, `src/handle/`).
- **`reviewed_at` storage** — git SHA vs content hash only (proposed: content hash is enough; SHA is
  informational).
