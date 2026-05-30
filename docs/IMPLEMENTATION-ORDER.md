# Jejak — Implementation Order

Living doc. Update **Status**, **Results / notes**, and item order as we learn more.

**Design source:** [DESIGN-LLD.md §4, §19](DESIGN-LLD.md) · [LESSONS-FROM-FINN.md §13](LESSONS-FROM-FINN.md)

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

After scaffold (item 1), **define every user-facing command** before writing feature logic. Install, init, daily use, push, update, doctor, uninstall — the spec drives what we build, not the other way around. Deliverable: **item 2 below** (same file — no separate doc).

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
| **Record** | Fill in **Results / notes** — what worked, what broke, commands run | Agent + user |

**No smoking.** Automated smoke tests guard regressions; they do **not** mark an item done. An item is done only when the test-project checklist passes.

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
- **Per-item *Verbs touched*** field cleanly threads item 2's spec through items 3–6

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

**Jejak hooks are never installed in the jejak repo itself.** All capture happens in the test project (`~/Documents/projects/jejak-testproj/`). This is enforced three ways:

1. **Process (here):** never run `jejak install --claude-code` from inside the jejak repo. Item 1 and onward must NOT add `.claude/settings.json` referencing jejak hooks to the jejak repo.
2. **Code safeguard (item 5):** `jejak install` MUST refuse if the current repo's `package.json` name matches the jejak package name. Hard failure with an explanation pointing back to the test project.
3. **Escape hatch (item 5):** any repo with `.jejak/disabled` (empty marker file) makes hooks no-op even if installed. Recovery path for accidental installs.

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
│   ├── settings.json.template    ← `{{JEJAK_CLI}}` placeholder; install resolves to `jejak` on PATH
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

`jejak install --claude-code` resolves the running CLI path (`which jejak` or `process.execPath`) and substitutes `{{JEJAK_CLI}}` in `settings.json.template`. Agent hooks invoke:

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

`settings.json.template` registers all three; `jejak install --claude-code` substitutes `{{JEJAK_CLI}}` in each command string.

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

**Status:** `pending`  
**LLD:** README · ARCHITECTURE.md §6 · DESIGN-LLD §16  
**Depends on:** 1

**Verbs first.** Before any feature code, flesh out the spec below. This section is the user-facing contract for items 3–6 — keep it here, not a separate file.

### Verb index (fill in during item 2)

| Verb | Item | Status | When / purpose |
|---|---|---|---|
| `npm install -g` / `jejak --version` | 1–2 | stub | Get jejak |
| `jejak init` | 4 | stub | One-time repo setup |
| `jejak install --claude-code` | 5 | stub | Wire hooks |
| *(hooks — automatic)* | 5 | — | Capture on session end |
| `jejak status` | 6 | stub | Local vs origin trace state |
| `jejak active-session-id` | 5 | stub | Open session(s) |
| `jejak log` / `show` / `link` | 6 | stub | Browse traces |
| `jejak push` / `fetch` | 6 | stub | Share traces |
| `jejak attach` | 6 | stub | Missed capture recovery |
| `jejak doctor` / `--trace` | 6 | stub | Diagnostics |
| `npm update -g` + `jejak install --force` | 2 | spec | Update jejak + refresh hooks |
| `jejak uninstall` | 6 | stub | Remove hooks + optional `~/.jejak/<repo-hash>/` purge; shadow ref untouched |

Per verb, add a subsection under **Verb specs** with: syntax, flags, exit codes, depends-on, preconditions, success/failure output, test-project steps.

### Verb spec template

```
### `jejak <verb>`
Item N · stub|spec|shipped
When: …
Depends on: …          ← e.g. jejak init, PII initialized, git repo
Syntax: jejak <verb> [flags] [args]
Preconditions: …
Success / failure / exit codes: …
Test project: 1. … 2. …
```

### Test project

**Path:** `~/Documents/projects/jejak-testproj/` (created in item 0 — do not recreate unless reset)

**Setup:** `pnpm link --global` from jejak clone → `cd ~/Documents/projects/jejak-testproj` → extend per item.

### User journey: first trace end-to-end

*(Item 2 deliverable — install → capture → commit → push → fetch → show/link)*

```text
# TBD
```

### Verb specs

*(One subsection per verb — fill in during item 2)*

#### Update workflow (IM-3 — draft spec)

**When:** After `npm update -g jejak` (or `pnpm update -g jejak`).

**Depends on:** jejak previously installed in target repo.

**Behavior:** Hook scripts embed the resolved CLI path at install time. After upgrade, re-run `jejak install --claude-code --force` to refresh agent + git hooks. Full `jejak doctor` (item 6) flags stale hook scripts when embedded version ≠ running `--version`.

**Done when:**
- [ ] Verb index complete; every v0.1 verb has a spec subsection
- [ ] User journey written (see above)
- [ ] Update workflow spec finalized (see above)
- [ ] Verb-coverage sentinel: CI script diffs **public** `jejak --help` subcommands vs `scripts/expected-verbs.json` — zero mismatches. Excludes hidden `_hook` / `_dev` and non-CLI steps (`npm install -g`). Index rows like `log / show / link` expand to three entries in the manifest.
- [ ] Reviewed and approved by user

**Test project checklist:**
1. `cd ~/Documents/projects/jejak-testproj` (from item 0)
2. `pnpm link --global` from jejak clone — `jejak --version` prints version
3. `jejak --help` — every verb in the index listed with stub or spec-accurate help
4. Verb-coverage script passes (index ↔ `--help` bijection)

**Results / notes:**
- Test project path: `~/Documents/projects/jejak-testproj/`

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

**Status:** `pending`  
**LLD:** §10 shadow write · §11 layout · build steps S2, S3  
**Depends on:** 3  
**Verbs touched:** `jejak init`

Write stripped sessions to `refs/heads/jejak/sessions/v1` without touching the working tree.

**Done when:**
- [ ] `src/shadow_branch.ts` — `sessionPath()`, upsert, CAS/flock
- [ ] `jejak init` creates shadow ref + `.gitattributes`
- [ ] Round-trip test: write session → read back from ref
- [ ] Test project checklist below passes

**Test project checklist:**
1. In test project: `jejak init`
2. `git show-ref refs/heads/jejak/sessions/v1` — ref exists
3. `git cat-file -p refs/heads/jejak/sessions/v1:.gitattributes` — present with expected shadow-branch rules
4. `jejak _dev write-fixture --session sess_test --handle alice ~/Documents/projects/jejak-testproj/tmp/stripped.jsonl` (uses fixture from item 3; compresses to `events.jsonl.gz` on write) → `git cat-file -p refs/heads/jejak/sessions/v1:sessions/alice/<shard>/sess_test/events.jsonl.gz` exists → `jejak _dev read-fixture --session sess_test --handle alice` returns identical decompressed bytes
5. `git status` clean (shadow ref write does not touch working tree)

(Note: `jejak _dev {write,read}-fixture` is a hidden dev/test subcommand under `src/dev/write_fixture.ts` — not a public verb.)

**Results / notes:**
- 

---

## 5. Capture loop (hooks + worker)

**Status:** `pending`  
**LLD:** §5 lifecycle · §6 worker · §14 ledger · build steps S3b, S4  
**Depends on:** 4  
**Verbs touched:** `jejak install --claude-code`, `jejak active-session-id`, automatic capture

End-to-end capture: session start → partial snapshots → session end → shadow write. Git hook stamps trailers (inert until ledger has open sessions).

**Done when:**
- [ ] Session ledger (SQLite) tracks open/captured sessions
- [ ] Agent hooks + `snapshot_worker` with flag-and-rerun coalescing
- [ ] Local staging at `~/.jejak/staging/` before shared write
- [ ] `prepare-commit-msg` appends `Jejak-Session:` trailers (exit 0 always)
- [ ] `jejak install --claude-code` wires hooks
- [ ] **Self-install refusal:** `jejak install` exits non-zero with a clear message if `package.json` name matches the jejak package name (prevents jejak-on-jejak capture). Override flag `--i-know-what-im-doing` exists for jejak's own development edge cases but never documented in public help.
- [ ] **`.jejak/disabled` escape hatch:** every hook (agent and git) checks for `.jejak/disabled` at repo root before doing any work; exits 0 silently if present. Documented in README as the per-repo opt-out.
- [ ] **Minimal `jejak doctor`** (install-checks only): agent hook in `.claude/settings.json`, git hook in `.git/hooks/`, ledger DB exists, no orphan locks, `.jejak/disabled` presence reported. Full doctor (sync, dispatch errors, PII gate, trace) lands in item 6.
- [ ] Test project checklist below passes

**Test project checklist:**
1. From inside the **jejak repo itself**: `jejak install --claude-code` → exits non-zero with "refusing to install in jejak repo" message
2. `cd ~/Documents/projects/jejak-testproj && jejak install --claude-code` → succeeds
3. `jejak doctor` (minimal) reports all install checks pass; `.jejak/disabled` reported as absent
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
- [ ] `jejak uninstall` — removes agent + git hook entries from `.claude/settings.json` and `.git/hooks/`; `--purge` flag also removes `~/.jejak/<repo-hash>/`; shadow ref untouched; re-`install` cleanly restores
- [ ] Full test-project run of item 2 **User journey** passes

**Test project checklist:**
*(From item 2 user journey — install → capture → commit → push → fetch → show/link; optionally second clone as teammate)*

**Results / notes:**
- 

---

## Deferred (not in v0.1 order)

- Dogfood cohort (LLD §20 Q3) — starts after item 6 is usable
- `jejak watch` (filesystem-watcher fallback), pre-turn diff, Cursor adapter — v0.2+
