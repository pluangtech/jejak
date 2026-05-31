# Jejak — Implementation Order

Living doc. Update **Status**, **Results / notes**, and item order as we learn more.

**Design source:** [DESIGN-LLD.md §4, §19](DESIGN-LLD.md) · [LESSONS-FROM-FINN.md §13](LESSONS-FROM-FINN.md) · **CLI UX:** [CLI-SPEC.md](CLI-SPEC.md)

| Status | Meaning |
|---|---|
| `pending` | Not started |
| `in_progress` | Active work |
| `done` | Verified / merged |
| `blocked` | Waiting on input or dependency |
| `deferred` | Pushed to a later milestone |

---

## Tech stack (locked)

| Decision | Choice | Why |
|---|---|---|
| **Language** | **TypeScript 5.x, strict mode** | OSS ecosystem expectation; matches Claude Code's stack; type-safe payloads and git operations |
| **Runtime** | **Node 20 LTS+** (`engines.node >=20.0.0`) | Ubiquitous, LTS-supported, has native fetch / test runner / watch |
| **Module system** | **ESM** (`.ts` → `.js` ESM output; `"type": "module"`) | Modern default; no CJS legacy |
| **Package manager** | **pnpm** | Faster + less disk than npm; standard for serious 2026 OSS |
| **Build** | **tsup** (esbuild under the hood) | Single config, produces ESM + `.d.ts`; ~10x faster than tsc |
| **Distribution** | **npm** (`jejak`) | Standard; users running Claude Code already have Node |
| **CLI framework** | **commander** | Battle-tested, well-typed, boring-safe |
| **Tests** | **vitest** | TS-native, fast, vite-aligned, in-process by default |
| **Lint + format** | **biome** | Single tool, very fast, replaces eslint + prettier |
| **Type checker** | **tsc --noEmit** in CI | Strict mode enforcement separate from build |
| **Logger** | **pino** | JSON, fast, production-grade; writes to `~/.jejak/dispatch/<repo-hash>.log` |
| **Embedded DB** | **better-sqlite3** | Synchronous, native bindings, the standard for Node CLIs |
| **Compression** | native `node:zlib` (gzip) for v0.1 → `@mongodb-js/zstd` in v0.2 if size matters | Defer the native dep; gzip is good enough to validate the design |
| **Hook scripts** | `jejak` CLI `_hook` subcommand (resolved `{{JEJAK_CLI}}` path) | One language end-to-end; agent hooks call `jejak _hook …`, not raw `node` |
| **Git hook scripts** | minimal bash wrapper that execs `node` | `prepare-commit-msg` needs POSIX shebang; ~3 lines of bash, then `exec node` |

**Not chosen and why:**
- **Python** — would lose Claude Code ecosystem alignment and OSS contributor reach. Finn's substrate translates to TS in days, not weeks (the patterns matter more than the LOC).
- **Go** (like Entire) — single-binary distribution is nice but unnecessary at v0.1; users running Claude Code already have Node. Revisit for v1.0 if distribution friction surfaces.
- **Bun runtime** — modern but newer; npm distribution is still the universal answer in 2026. Bun-compatible code will run on Bun anyway.
- **eslint + prettier** — biome covers both in one tool, faster, less config.
- **citty / clipanion** — newer CLI frameworks with good TS DX, but commander has 10+ years of edge-case fixes; pick boring for v0.1.

**Platform support v0.1:** macOS + Linux. Windows deferred (bash shim for `prepare-commit-msg` + flock semantics need a Windows-specific adapter; Node itself is fine on Windows).

---

## Modus operandi

**Read this first.** This is how we build jejak — not a one-time note.

### 1. Verbs before internals

After scaffold (item 1), **define every user-facing command** before writing feature logic. Global `npm install`, then `init`, `setup`, daily use, push, update, doctor, uninstall — the spec drives what we build, not the other way around. Deliverable: **[CLI-SPEC.md](CLI-SPEC.md)** (item 2 tracks status here).

### 2. One item at a time

Work strictly in order. Do not start item N+1 until item N is **done** (automated tests green **and** real test-project verification — see below).

### 3. Build → test → deploy → record (every item)

Each execution item (3+) follows the same loop:

| Step | What | Who |
|---|---|---|
| **Build** | Implement only what this item's *Done when* requires | Agent |
| **Test (automated)** | `pnpm test`, `pnpm lint`, `pnpm typecheck` — CI must pass | Agent |
| **Deploy** | `pnpm build && pnpm link --global` (or equivalent) so the test project sees the new build | Agent |
| **Test (real)** | Run the item's **Test project checklist** in a live repo | Agent provides commands; user runs them |
| **Docs** | Add/update the item's `docs/user/` page(s) and run `pnpm docs:gen` (see item 4.5) | Agent |
| **Record** | Fill in **Results / notes** — what worked, what broke, commands run | Agent + user |

**No smoking.** Automated smoke tests guard regressions; they do **not** mark an item done. An item is done only when the test-project checklist passes.

**Docs are part of done.** Any item that ships or changes user-facing behavior is not done until its `docs/user/` page is updated and `pnpm docs:gen` is clean — enforced by `tests/docs-coverage.test.ts` (see item 4.5). This is the mechanism that keeps user docs from drifting.

**Rollback semantics.** If automated tests OR the test-project checklist fail at any step → item status reverts to `in_progress`. **Never mark `done` with any red step.** If repeated failure (≥2 cycles) indicates wrong scope or missing dependency, split the item or escalate to user before continuing.

### 4. Test project

- **Path:** `~/Documents/projects/jejak-testproj/` (sibling to `jejak/`, **not nested** — keeps the test repo out of jejak's own git tree).
- **Setup ownership:** **Agent provides the exact commands** (`mkdir`, `git init`, `pnpm link --global` from jejak clone, etc.) at item start. User runs them and confirms.
- **When:** before closing any item from 3 onward (item 2 records the path in its Results).
- **How:** each item lists a **Test project checklist** — copy-paste commands with expected output.
- **Resetting:** if the test project gets into a bad state, `rm -rf ~/Documents/projects/jejak-testproj/` and the agent re-runs setup. Treat the test project as disposable.
- **Distribution testing:** local link only for items 1–6 (`pnpm build && pnpm link --global` from jejak clone). No npm publish until dogfood / v0.1 tag.

### Role glossary

- **Agent** = the AI executing implementation work (Claude Code, etc.)
- **User** = you, the developer driving the project

### 5. Never repeat this briefing

Future sessions: read this section + current item status. Do not re-derive process from conversation history.

---

## Architect review of implementation plan (2026-05-30, round 2)

**Verdict:** Strong shape. Modus operandi is the right discipline. Verbs-first (item 2) prevents the most common drift — building infra before knowing what UX it has to support. **Four issues were identified in round 2 and resolved in this revision.**

### What's strong (briefly)

- **Verbs-first ordering** forces user-facing thinking before infra
- **Test-project gate** ("no smoking") prevents vitest-green-but-broken-IRL
- **"Never repeat this briefing"** anti-context-rot guard for long-running dev
- **Per-item *Verbs touched*** field cleanly threads [CLI-SPEC.md](CLI-SPEC.md) through items 3–6

### Critical — resolved in this revision

- ~~CR-1. Rollback semantics~~ → applied to Modus operandi §3
- ~~CR-2. Items 3 & 4 reference non-existent verbs~~ → switched to `jejak _dev strip` and `jejak _dev {write,read}-fixture` dev/test entry points
- ~~CR-3. Item 5 calls `jejak doctor` before it exists~~ → minimal install-check doctor added to item 5; full doctor in item 6
- ~~CR-4. Agent provides test-project setup~~ → Modus operandi §4 reframed; path locked to `~/Documents/projects/jejak-testproj/`

### Important — integrated into item 2

- ~~**IM-1.** Verb spec template missing "Depends on" field~~ → added to item 2 template
- ~~**IM-2.** Verb-coverage sentinel~~ → added to item 2 *Done when* + CI script in item 1 scaffold
- ~~**IM-3.** Update flow verb spec~~ → added to item 2 verb index + spec stub
- ~~**IM-4.** PII coverage in item 6~~ → applied to item 6 *Done when*

### Nice to have

- **NH-1.** Add brief time estimates per item ("1-2 days," "3-5 days") to help calendar planning.
- **NH-2.** Extend the "Locked" pattern from item 1 to items 3–6 as decisions emerge (e.g., item 3 will lock compression level, schema version; item 4 will lock CAS retry counts).
- **NH-3.** Add a v0.1 release/tagging step after item 6: *"Tag v0.1.0; publish to npm with `--tag beta`; dogfood cohort installs with `npm install -g jejak@beta`."*
- ~~**NH-4.** Partial `jejak uninstall` in v0.1~~ → applied: full uninstall ships in item 6 (`jejak uninstall [--purge]`).

### Status

- **CR-1..CR-4:** ✅ applied. Ready to start item 0/1.
- **IM-1..IM-4:** ✅ integrated into items 2 and 6.
- **NH-*:** add as you go; don't gate item 1.

---

## 0. Pre-flight & bootstrap

**Status:** `done`  
**LLD:** —  
**Depends on:** nothing

Decisions and external setup that must happen before item 1. No code touched; this unblocks the scaffold.

**Done when:**
- [x] **npm package name decided** — run `npm view jejak`; if taken, fall back to scoped `@<your-npm-handle>/jejak`. Record final name in Results.
- [x] **Git host + repo created** — empty repo on GitHub/GitLab/self-hosted. Record URL in Results.
- [x] **License chosen** — MIT recommended (broad contributor compatibility, matches Entire CLI). Record in Results.
- [x] **Maintainer git identity** — `git config user.name` + `user.email` set globally or per-repo. Drives default `dev-handle` resolution ([DESIGN-LLD.md §2](DESIGN-LLD.md#2-resolved-design-decisions)).
- [x] **Local clone created** — `git clone <repo-url> <local-path> && cd $_`. This is where item 1 lands. Record path in Results.
- [x] **Test project directory created** — `mkdir -p ~/Documents/projects/jejak-testproj && cd $_ && git init`. Record path in Results (default: `~/Documents/projects/jejak-testproj/`).
- [x] **Design docs accessible to the implementation agent** — under `docs/` (`DESIGN-LLD.md`, `ARCHITECTURE.md`, `LESSONS-FROM-FINN.md`, `IMPLEMENTATION-ORDER.md`, `REVIEW-LLD*.md`); index at [docs/README.md](README.md).

### No self-capture invariant

**Jejak hooks are never configured in the jejak repo itself.** All capture happens in the test project (`~/Documents/projects/jejak-testproj/`). This is enforced three ways:

1. **Process (here):** never run `jejak init` / `jejak setup` from inside the jejak repo. Item 1 and onward must NOT add `.claude/settings.json` referencing jejak hooks to the jejak repo.
2. **Code safeguard (item 5):** `jejak setup` MUST refuse if the current repo's `package.json` name matches the jejak package name. Hard failure with an explanation pointing back to the test project.
3. **Escape hatch (item 5):** any repo with `.jejak/disabled` (empty marker file) makes hooks no-op even if configured. Recovery path for accidental setup.

If you ever see `.jejak/` or `.claude/settings.json` containing jejak entries appear in the jejak repo's working tree, stop and investigate.

**Test project checklist:** N/A — bootstrap only.

**Results / notes:**
- npm package name: **`jejak`** (unscoped) — `npm view jejak` → 404 (not published, 2026-05-30). No collision with exact name; unrelated packages exist (`jejak-awan-pesawat`, `react-native-jejak-tms-ui`, etc.). Scoped `@pluang/jejak` also free if we ever need it.
- Repo URL: https://github.com/pluangtech/jejak (public, empty remote; `origin` → `git@github.com:pluangtech/jejak.git`)
- License: **MIT** — `LICENSE` added (copyright Pluang 2026)
- Maintainer handle (`user.name` / `user.email`): Aditya Jha / aditya.jha@pluang.com (per-repo `git config` in jejak clone)
- Local clone path: `/Users/aditya/Documents/pluang/jejak` (init in place; not a fresh `git clone`)
- Test project path: `/Users/aditya/Documents/projects/jejak-testproj` (`git init` done)
- Design docs: `docs/` (`DESIGN-LLD.md`, `ARCHITECTURE.md`, `LESSONS-FROM-FINN.md`, `IMPLEMENTATION-ORDER.md`, `REVIEW-LLD*.md`); overview in root `README.md`

---

## 1. Project scaffold & folder structure

**Status:** `done`  
**LLD:** §4 module layout · LESSONS-FROM-FINN §13 adapter pattern

Define the repo skeleton before feature code. Host-neutral core in one tree; agent-specific wiring isolated under `adapters/`. Every later item lands in a known place.

**Locked (architect review 2026-05-30):** `src/` layout · **TypeScript 5.x strict** on **Node 20 LTS+** · **pnpm** · **tsup** (build) · **commander** (CLI) · **pino** (logger) · **better-sqlite3** · **vitest** + **biome** · CI on every PR. See [Tech stack](#tech-stack-locked) for full table.

**Principles:**
- **Adapter boundary** — only `adapters/<host>/` and reader profiles are host-specific; no Claude-isms in core `src/`
- **Thin CLI, fat lib** — `jejak` commands delegate to modules; hooks call the same lib code paths
- **Testable from day one** — `tests/` + `tests/fixtures/` beside the package; golden files live with tests
- **Ship small** — v0.1 target is ~10 meaningful modules, not a Finn-scale tree (LESSONS-FROM-FINN §14.1)

**Done when:**
- [x] Tree matches layout below (`src/`, `adapters/claude-code/`, `tests/fixtures/{sessions,golden}/`)
- [x] `package.json` — `"type": "module"`, `engines.node >=20.0.0`, `bin.jejak` → `dist/cli.js`, narrow-pinned dev deps, `scripts` for `build`/`test`/`lint`/`typecheck`
- [x] `tsconfig.json` — strict mode, ESNext target, `moduleResolution: "bundler"`, `outDir: dist/`
- [x] `tsup.config.ts` — entry `src/cli.ts`, format ESM, target Node20, `dts: true`, single bundle
- [x] `biome.json` — formatter + linter config
- [x] Stub modules per LLD §4 — each throws with LLD § citation and implementation-order item number
- [x] `LICENSE` (MIT), `CHANGELOG.md` (`## [0.1.0-dev] — Unreleased`), `.gitignore` (`node_modules/`, `dist/`, `.jejak/`, caches)
- [x] `.github/workflows/ci.yml` — `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, verb-coverage check (`scripts/expected-verbs.json` ↔ public `--help`) on PR
- [x] `pnpm install && pnpm build && pnpm link --global` in clean checkout; `jejak --version` / `--help` work; subcommand stubs throw `"Not yet implemented (item N)"`
- [x] Import smoke test passes in CI (not a substitute for test-project verification — that starts item 2)

**Test project checklist:** N/A — scaffold only. Real test project starts at item 2.

**Results / notes:**
- **Testing workflow (locked):** Option 1 — local dev only for v0.1 (`pnpm build && pnpm link --global`; no npm publish until dogfood).
- Verified 2026-05-30: `pnpm typecheck`, `lint`, `test`, `build` green; `jejak --version` → `0.1.0-dev`; `jejak init` → `Not yet implemented (item 4) — see DESIGN-LLD.md §10.1` (exit 1).
- After code changes: re-run `pnpm build && pnpm link --global` from jejak clone.

### Architect review (2026-05-30)

**Verdict:** Right scope, right shape. Layout and toolchain locked — see **Locked** above.

#### Layout (`src/` layout — locked)

```
jejak/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsup.config.ts
├── biome.json
├── README.md
├── LICENSE
├── CHANGELOG.md
├── .gitignore
├── .github/workflows/ci.yml
├── scripts/
│   └── expected-verbs.json     ← public subcommand manifest for verb-coverage CI
├── src/
│   ├── cli.ts                    (commander entry; bin target)
│   ├── version.ts                (single source of truth)
│   ├── shadow_branch.ts          ← item 4
│   ├── snapshot_worker.ts        ← item 5
│   ├── capture_hook_utils.ts     ← item 5
│   ├── commit_trailers.ts        ← item 5
│   ├── stripper.ts               ← item 3
│   ├── pii_scanner.ts            ← item 6
│   ├── session_ledger.ts         ← item 5
│   ├── doctor.ts                 ← item 6
│   ├── logger.ts                 (pino wrapper)
│   ├── types.ts                  (shared interfaces; StrippedEvent, SessionMeta, HookPayload)
│   ├── transcript_readers/
│   │   ├── base.ts               (Reader interface)
│   │   └── claude_code_jsonl.ts  ← item 3
│   └── dev/                      (hidden `jejak _dev …` subcommands for test-project work)
│       ├── strip.ts              ← item 3
│       └── write_fixture.ts      ← item 4
├── adapters/claude-code/
│   ├── settings.json.template    ← `{{JEJAK_CLI}}` placeholder; setup resolves to `jejak` on PATH
│   └── git-hooks/prepare-commit-msg   (3-line bash → exec node … _hook prepare-commit-msg)
└── tests/
    ├── fixtures/{sessions,golden}/
    └── smoke.test.ts
```

#### Stub depth

Each stub throws with LLD § **and** implementation-order item number:

```typescript
export function upsertSessionBlobs(/* args */): string {
  throw new Error("Implementation-order item 4 — see DESIGN-LLD.md §10.1")
}
```

#### Hook wiring (locked)

`jejak setup --claude-code` resolves the running CLI path (`which jejak` or `process.execPath`) and substitutes `{{JEJAK_CLI}}` in `settings.json.template` (not `jejak install`). Agent hooks invoke:

```json
"command": "{{JEJAK_CLI}} _hook session-end"
```

Git hook `prepare-commit-msg` is a 3-line bash script that `exec`s the same resolved path with `_hook prepare-commit-msg`. Hidden `_hook` subcommand is internal — not listed in public `--help`.

**Agent hook events (locked — kebab-case maps to Claude Code hook names):**

| Claude Code event | `_hook` argument |
|---|---|
| `SessionStart` | `session-start` |
| `Stop` | `stop` |
| `SessionEnd` | `session-end` |

`settings.json.template` registers all three; `jejak setup --claude-code` substitutes `{{JEJAK_CLI}}` in each command string.

#### Explicitly *not* doing

- No separate `bin/` directory — use `package.json` `"bin"` field pointing at `dist/cli.js`
- No Finn governance trees (`.jejak/specs/`, etc.)
- No `migrations/` until schema v2
- No desktop UI — v0.1 is CLI only

#### First-PR sketch

One PR, ~30 scaffold files, no logic. CI green; `jejak --help` lists all v0.1 subcommands as stubs that throw `"Not yet implemented (item N)"`. Hidden internal subcommands also stubbed: `_hook session-start`, `_hook stop`, `_hook session-end`, `_hook prepare-commit-msg`, `_dev strip`, `_dev write-fixture`, `_dev read-fixture`.

After merge, items 3–6 each touch ~3–5 modules within this skeleton — never restructure it.

---

## 2. CLI verbs & user journeys (spec)

**Status:** `in_progress`  
**Spec:** **[CLI-SPEC.md](CLI-SPEC.md)** — onboarding, verb index, per-verb specs, user journey  
**Init LLD:** **[plans/INIT-IMPLEMENTATION-PLAN.md](plans/INIT-IMPLEMENTATION-PLAN.md)** — Phase A/B, diagrams, example runs  
**LLD:** ARCHITECTURE.md §6 · DESIGN-LLD §16  
**Depends on:** 1

Edit verb details in **CLI-SPEC.md** only. This item tracks completion and test-project verification.

**Done when:**
- [ ] [CLI-SPEC.md](CLI-SPEC.md) verb index complete; every v0.1 verb has a spec subsection
- [ ] [CLI-SPEC.md](CLI-SPEC.md) user journey written (Steps 0–3+)
- [ ] [CLI-SPEC.md](CLI-SPEC.md) update workflow spec finalized
- [ ] Verb-coverage sentinel: CI script diffs **public** `jejak --help` subcommands vs `scripts/expected-verbs.json` — zero mismatches. Excludes hidden `_hook` / `_dev` and non-CLI steps (`npm install -g`). Index rows like `log / show / link` expand to three entries in the manifest.
- [ ] Reviewed and approved by user

**Test project checklist:**
1. `cd ~/Documents/projects/jejak-testproj` (from item 0)
2. `pnpm link --global` from jejak clone — `jejak --version` prints version
3. `jejak --help` — every verb in the index listed with stub or spec-accurate help
4. Verb-coverage script passes (index ↔ `--help` bijection)

**Results / notes:**
- Spec doc: [CLI-SPEC.md](CLI-SPEC.md)
- Test project path: `~/Documents/projects/jejak-testproj/`
- `init` + `setup` specs drafted; remaining verbs stubbed in CLI-SPEC

---

## 3. Ingest & strip pipeline

**Status:** `pending`  
**LLD:** §7 transcript reader · §8 stripper · build step S1  
**Depends on:** 2  
**Verbs touched:** *(internal — enables capture; no user verb yet)*

Raw Claude Code JSONL → stripped events. Golden-file tests lock the format before any git I/O.

**Done when:**
- [ ] `src/transcript_readers/claude_code_jsonl.ts` reads + resumes from offset
- [ ] `src/stripper.ts` produces `<500 KB` output from sample sessions
- [ ] Golden tests pass on checked-in fixtures
- [ ] Test project checklist below passes

**Test project checklist:**
1. `pnpm install && pnpm build && pnpm link --global` from jejak repo (re-run after code changes)
2. Copy a real Claude Code `.jsonl` from `~/.claude/projects/.../<session-id>.jsonl` into `~/Documents/projects/jejak-testproj/tmp/raw.jsonl`
3. `jejak _dev strip ~/Documents/projects/jejak-testproj/tmp/raw.jsonl > /tmp/stripped.jsonl` — exit 0; `wc -c /tmp/stripped.jsonl` reports `< 500000`
4. `jejak _dev strip --resume-from <offset> ~/Documents/projects/jejak-testproj/tmp/raw.jsonl` — no events with `id` already in the first run's output
5. `pnpm test -- stripper` green

(Note: `jejak _dev strip` is a hidden dev/test subcommand under `src/dev/strip.ts` — not a public verb. Removed before v1.0.)

**Results / notes:**
- 

---

## 4. Shadow storage & init

**Status:** `in progress` — Phase A (init) shipped; Phase B (upsert) pending item 3  
**Plan:** [plans/INIT-IMPLEMENTATION-PLAN-v2.md](plans/INIT-IMPLEMENTATION-PLAN-v2.md) (pattern-based, hybrid distribution) — supersedes the original plan. **Phase A** (init) is done; **Phase B** (upsert/round-trip) needs item 3  
**LLD:** §10 shadow write · §11 layout · build steps S2, S3  
**Depends on:** 3 (Phase B); 2 sign-off (Phase A)  
**Verbs touched:** `jejak init`

Write stripped sessions to `refs/heads/jejak/sessions/v1` without touching the working tree.

**Done when:**
- [x] `src/git/GitClient.ts` (facade) + `src/shadow/ShadowRepository.ts` — idempotent `ensure()` (orphan ref + seed tree + CAS + `merge.ours.driver`)
- [x] `jejak init` creates the shadow ref + seed-tree `.gitattributes`, writes committed `.jejak/config.json` `{v, agent, mode}`, resolves dev_handle, hybrid project/global mode
- [x] Unit + integration tests green (47 tests; real-git integration for ref creation, seed tree, idempotency, exit codes)
- [ ] **(Phase B)** `ShadowRepository.upsert()` / `sessionPath()` + round-trip test: write session → read back from ref
- [ ] **(Phase B)** Test project checklist below passes (step 4 needs item 3)

**Test project checklist:**
1. In test project: `jejak init`
2. `git show-ref refs/heads/jejak/sessions/v1` — ref exists
3. `git cat-file -p refs/heads/jejak/sessions/v1:.gitattributes` — present with expected shadow-branch rules
4. `jejak _dev write-fixture --session sess_test --handle alice ~/Documents/projects/jejak-testproj/tmp/stripped.jsonl` (uses fixture from item 3; compresses to `events.jsonl.gz` on write) → `git cat-file -p refs/heads/jejak/sessions/v1:sessions/alice/<shard>/sess_test/events.jsonl.gz` exists → `jejak _dev read-fixture --session sess_test --handle alice` returns identical decompressed bytes
5. `git status` clean (shadow ref write does not touch working tree)

(Note: `jejak _dev {write,read}-fixture` is a hidden dev/test subcommand under `src/dev/write_fixture.ts` — not a public verb.)

**Results / notes:**
- **2026-05-31 — Phase A shipped** (`5e95019`). Pattern-based, modular build per
  [INIT-IMPLEMENTATION-PLAN-v2](plans/INIT-IMPLEMENTATION-PLAN-v2.md): `git/GitClient`
  (facade), `shadow/ShadowRepository.ensure()` (orphan ref + seed tree + CAS +
  `merge.ours.driver`, never checked out), `agents/` (Adapter+Registry), `modes/`
  (Strategy: project/global), `handle/` (CoR), `config/ConfigStore`, `prompt/`,
  `init/` pipeline, thin `cli.ts`. Hybrid distribution + committed `.jejak/config.json`
  `{v, agent, mode}`; `dev_handle` resolved per-dev (not committed).
- Build now emits a `#!/usr/bin/env node` shebang (tsup banner) so `pnpm link --global`
  yields a real `jejak` on PATH (no alias).
- **Test-project checklist 1–3 verified** in `~/Documents/projects/jejak-testproj`:
  picker → summary; `git show-ref` shows the shadow ref; working tree stayed on `main`;
  `.jejak/config.json` + `.jejakignore` written; re-run prints "already initialized".
  Step 4 (write/read-fixture round-trip) is **Phase B**, gated on item 3.
- **Remaining for full `done`:** Phase B — `ShadowRepository.upsert()` / `sessionPath()`
  + round-trip — unblocked once item 3 (strip) lands.

---

## 4.5 User-facing documentation layer  ← **NEXT TASK**

**Status:** `in_progress` — Tiers 1–4 implemented (generate / guard / audit / publish)  
**Plan:** [plans/DOCS-IMPLEMENTATION-PLAN.md](plans/DOCS-IMPLEMENTATION-PLAN.md) (validated via `/validate-plan`, 0 GAPs)  
**Depends on:** 4 (a shipped verb to document); informs every later item  
**Verbs touched:** none new — establishes *where/how* we document user-facing behavior  
**Why now:** lock the documentation layer before more features land, so each feature ships
its docs instead of having them reconstructed later. (Init, item 4, is the first thing to document.)

User docs are for **people who use jejak**. They are distinct from the internal design docs
(`DESIGN-LLD`, `ARCHITECTURE`, this file) and from the dev-facing `CLI-SPEC` (behaviour
contracts). This item builds the home for them and the guardrail that keeps them current.

**Where (markdown-in-repo + a dev-only published site):**
- `docs/user/` — single source of truth for user docs (committed; [Diátaxis](https://diataxis.fr) layout):
  - `README.md` — index + 5-minute getting-started.
  - `<verb>.md` — one page per shipped verb (`init.md`, later `setup.md`, …).
  - `concepts/<id>.md` — explanation pages (e.g. `concepts/shadow-branch.md`): what it is, why it
    exists, how to use it, examples, third-party links.
  - `guides/` — task-oriented how-tos (land with the features they describe).
  - `commands.md` — **auto-generated** command reference (never hand-edited).
  - `registry.json` — **single manifest**: verbs + concepts, each with `status` and (for concepts)
    the `sources` they're derived from.
- `docs-site/` — **dev-only** [VitePress](https://vitepress.dev) site rendering `docs/user/`
  directly (`srcDir`, no copies). Excluded from the npm package; Pages workflow scaffolded + disabled.

> **Locked-decision change:** this supersedes the original "no doc-site tooling in v0.1" — VitePress
> is now included (dev-only). Rationale: [plans/DOCS-IMPLEMENTATION-PLAN.md](plans/DOCS-IMPLEMENTATION-PLAN.md) §6, §11.

**How we capture it (process):**
- Source-of-truth split: behaviour contracts stay in `CLI-SPEC` (dev); `docs/user/` is
  task-oriented prose + examples for end users. They must not contradict.
- Every item that ships/changes user-facing behaviour updates its `docs/user/` page as part
  of *Done when* — now also encoded in **Modus operandi §3** ("Docs are part of done").

**How we keep it up to date (automated guardrails — mirror the existing verb-coverage pattern):**
- `pnpm docs:gen` — script that renders `docs/user/commands.md` from the live commander
  program (`createProgram()` → per-command help), so the reference can't drift from the CLI.
- `tests/docs-coverage.test.ts` — CI guard that (a) every **shipped** public verb has a
  `docs/user/` page/section, and (b) `docs/user/commands.md` matches a fresh `docs:gen`
  (fails if stale) — exactly how `scripts/expected-verbs.json` is checked today.

**Done when:**
- [x] `docs/user/README.md` (getting-started) + `docs/user/init.md` (the one shipped verb)
- [x] `docs/user/concepts/shadow-branch.md` — first concept page (bound + source-hashed)
- [x] `pnpm docs:gen` + generated `docs/user/commands.md` (rendered from the live commander program)
- [x] `docs/user/registry.json` single manifest (verbs + concepts)
- [x] `tests/docs/docs-coverage.test.ts` green — verb + concept coverage, reference freshness,
      source-binding freshness, internal-link check
- [x] `tests/integration/docs-examples.test.ts` green — `<!-- run -->` examples execute (exit-0 asserted)
- [x] `docs-drift` skill + committed `.claude/settings.json` **Stop** hook (Tier 3 audit)
- [x] `docs-site/` VitePress (dev-only) + `docs:site:{dev,build}`; `.github/workflows/docs.yml` disabled
- [x] CI runs the docs guards (`pnpm test` + a `docs:gen` freshness step)
- [x] Modus operandi §3 "Docs are part of done" in force
- [ ] Test project checklist below passes (user verification)

> **Not a self-capture violation.** The committed `.claude/settings.json` adds a **docs** Stop hook
> (`pnpm docs:check`), not a jejak capture hook — it never registers `jejak _hook …`, writes
> `.jejak/`, or touches the shadow ref. The [§0 no-self-capture invariant](#no-self-capture-invariant)
> still holds.

**Test project checklist:**
1. `pnpm docs:gen` → `docs/user/commands.md` regenerates with **no** diff
2. Delete a shipped verb's doc section → `pnpm test` **fails** (guard works) → restore
3. A new reader follows `docs/user/README.md` end-to-end: `jejak init` in the test project
   reaches the `Next: jejak setup` hand-off with no missing steps

**Results / notes:**
- 

---

## 5. Capture loop (hooks + worker)

**Status:** `pending`  
**LLD:** §5 lifecycle · §6 worker · §14 ledger · build steps S3b, S4  
**Depends on:** 4  
**Verbs touched:** `jejak setup --claude-code`, `jejak active-session-id`, automatic capture

End-to-end capture: session start → partial snapshots → session end → shadow write. Git hook stamps trailers (inert until ledger has open sessions).

**Done when:**
- [ ] Session ledger (SQLite) tracks open/captured sessions
- [ ] Agent hooks + `snapshot_worker` with flag-and-rerun coalescing
- [ ] Local staging at `~/.jejak/staging/` before shared write
- [ ] `prepare-commit-msg` appends `Jejak-Session:` trailers (exit 0 always)
- [ ] `jejak setup --claude-code` wires hooks — **mode-aware** invocation: portable `npx jejak` in project mode (committable), resolved absolute path in global mode (per-machine). **Never clobber** existing `.claude/settings.json` hooks: detect → merge additively → stop and guide on conflict (`init` already reports pre-existing hooks)
- [ ] **Self-setup refusal:** `jejak init` / `jejak setup` exit non-zero in the jejak package repo. Override `--i-know-what-im-doing` undocumented.
- [ ] **`.jejak/disabled` escape hatch:** every hook (agent and git) checks for `.jejak/disabled` at repo root before doing any work; exits 0 silently if present. Documented in README as the per-repo opt-out.
- [ ] **Minimal `jejak doctor`** (setup-checks only): agent hook in `.claude/settings.json`, git hook in `.git/hooks/`, ledger DB exists, no orphan locks, `.jejak/disabled` presence reported. Full doctor (sync, dispatch errors, PII gate, trace) lands in item 6.
- [ ] Test project checklist below passes

**Test project checklist:**
1. From inside the **jejak repo itself**: `jejak setup --claude-code` → exits non-zero with self-setup refusal message
2. `cd ~/Documents/projects/jejak-testproj && jejak init` then `jejak setup --claude-code` → succeeds
3. `jejak doctor` (minimal) reports all setup checks pass; `.jejak/disabled` reported as absent
4. `touch .jejak/disabled && jejak doctor` → reports `disabled=true`; trigger a fake hook → no work done; `rm .jejak/disabled` re-enables
5. Run a real Claude Code session (or simulate hook with fixture JSON on stdin)
6. `jejak active-session-id` returns session ID while open
7. After session end: session appears on shadow ref under `sessions/<handle>/<shard:2>/<session-id>/`
8. Make a git commit → `git log -1 --format=%B` contains `Jejak-Session:` trailer (one per open session at commit time)

**Results / notes:**
- 

---

## 6. PII gate, push, and read CLI

**Status:** `pending`  
**LLD:** §9 PII · §15 push/fetch · §16 read path · build steps S5–S9  
**Depends on:** 5  
**Gate:** push blocked until PII dispatcher works (LLD hard gate)  
**Verbs touched:** `jejak push`, `jejak fetch`, `jejak show`, `jejak log`, `jejak link`, `jejak attach`, `jejak doctor [--trace]`, `jejak status`, `jejak uninstall`

Make traces safe to share and usable from the CLI. Every remaining v0.1 verb from item 2 goes live here.

**Done when:**
- [ ] PII scanner + 6-pattern catalog (+ `.jejak/pii.yaml` override)
- [ ] PII fixture session containing each of the 6 catalog patterns: `jejak show` confirms each is redacted; one fixture with a pattern at a path matching `.jejakignore` confirms full-path exclusion
- [ ] `jejak push` / `fetch` with merge
- [ ] **Full `jejak doctor` + `doctor --trace`** (extends minimal doctor from item 5): shadow sync ahead/behind, dispatch error count, PII-ready gate, filesystem warnings, watcher conflict, staging orphans, hook-latency p50/p95/p99
- [ ] `jejak show`, `log`, `link`, `active-session-id`, `attach`, `status`
- [ ] `jejak uninstall` — removes agent + git hook entries from `.claude/settings.json` and `.git/hooks/`; `--purge` flag also removes `~/.jejak/<repo-hash>/`; shadow ref untouched; re-`setup` cleanly restores
- [ ] Full test-project run of [CLI-SPEC.md user journey](CLI-SPEC.md#user-journey-first-trace-end-to-end) passes

**Test project checklist:**
*(From [CLI-SPEC.md](CLI-SPEC.md) user journey — capture → commit → push → fetch → show/link; optionally second clone as teammate)*

**Results / notes:**
- 

---

## Deferred (not in v0.1 order)

- Dogfood cohort (LLD §20 Q3) — starts after item 6 is usable
- `jejak watch` (filesystem-watcher fallback), pre-turn diff, Cursor adapter — v0.2+
