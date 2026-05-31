# Jejak — CLI specification (v0.1)

Living spec for user-facing commands and journeys. **Implementation tracking:** [IMPLEMENTATION-ORDER.md §2](IMPLEMENTATION-ORDER.md#2-cli-verbs--user-journeys-spec).

**Design sources:** [README.md](../README.md) · [ARCHITECTURE.md §6](ARCHITECTURE.md#6-cli-v01) · [DESIGN-LLD.md §16](DESIGN-LLD.md#16-cli)

> **User docs vs this spec.** This file is the **behaviour contract** (dev-facing). Task-oriented
> docs for end users live in [`docs/user/`](user/) (guide, per-verb pages, concept explanations,
> and an auto-generated [`commands.md`](user/commands.md)). The two must not contradict; user docs
> are guarded by `pnpm docs:check`. See [IMPLEMENTATION-ORDER.md §4.5](IMPLEMENTATION-ORDER.md).

| Status | Meaning |
|---|---|
| `spec` | Written; drives implementation |
| `stub` | CLI exists; throws until implementation item ships |
| `shipped` | Implemented and test-project verified |

---

## Getting started (locked for v0.1 UX)

| Step | What | Command |
|---|---|---|
| **0 — Install CLI** | Put `jejak` on your PATH | `npm install -g jejak` (dogfood: `@beta` when published). **Dev:** `pnpm build && pnpm link --global`. |
| **1 — Add to project** | Shadow branch + detect / choose agent | `cd my-repo && jejak init` |
| **2 — Configure capture** | Wire hooks for the chosen agent | `jejak setup --claude-code` |

### Verb glossary (avoid confusion)

| Word | Means |
|---|---|
| **install** | Only **`npm install -g jejak`** — not a `jejak` subcommand |
| **`init`** | Add jejak to a git repo; **detect** which agent(s) the repo uses; if none or many → interactive picker; persist choice in `.jejak/config.json` |
| **`setup`** | Explicitly **configure** hooks for one supported agent (e.g. `--claude-code`). Does not mean npm install. |
| **`uninstall`** | Remove jejak hooks from the repo (shadow ref stays) |

**Never** run `jejak init` / `jejak setup` inside the jejak dev repo — use `~/Documents/projects/jejak-testproj/`.

---

## Verb index

| Verb | Item | Status | When / purpose |
|---|---|---|---|
| `npm install -g` / `pnpm link` / `jejak --version` | 1–2 | spec | **Step 0** — get the CLI |
| `jejak init` | 4 | shipped | **Step 1** — add jejak to a project |
| `jejak setup --claude-code` | 5 | shipped | **Step 2** — configure hooks |
| *(hooks — automatic)* | 5 | 5b | Capture on session end (worker — item 5b) |
| `jejak status` | 6 | stub | Local vs origin trace state |
| `jejak active-session-id` | 5 | shipped | Open session(s) |
| `jejak log` / `show` / `link` | 6 | stub | Browse traces |
| `jejak push` / `fetch` | 6 | stub | Share traces |
| `jejak attach` | 6 | stub | Missed capture recovery |
| `jejak doctor` / `--trace` | 5/6 | 5: setup checks · 6: `--trace` | Diagnostics |
| `npm update -g` + `jejak setup --force` | 2 | spec | Update CLI + refresh hook scripts |
| `jejak uninstall` | 6 | stub | Remove hooks; optional `~/.jejak/<repo-hash>/` purge |

---

## Verb spec template

```
### `jejak <verb>`
Item N · stub|spec|shipped
When: …
Depends on: …
Syntax: jejak <verb> [flags] [args]
Preconditions: …
Success / failure / exit codes: …
Test project: 1. … 2. …
```

---

## Test project

**Path:** `~/Documents/projects/jejak-testproj/` (item 0 — reset with `rm -rf` if corrupted)

**Setup:** `pnpm link --global` from jejak clone → `cd ~/Documents/projects/jejak-testproj`

---

## User journey: first trace end-to-end

```text
# Step 0 — install CLI (dev)
cd ~/Documents/pluang/jejak && pnpm build && pnpm link --global
jejak --version

# Step 1 — add jejak to the project (test project, NOT jejak repo)
cd ~/Documents/projects/jejak-testproj
jejak init
# → detect agent (picker if none/ambiguous) → .jejak/config.json
# → shadow ref (seed .gitattributes on ref only), .jejakignore

# Step 2 — configure hooks (item 5)
jejak setup --claude-code

# Step 3+ — TBD (capture, commit, push, fetch, show/link)
```

---

## Verb specs

### `jejak init`

**Item:** 4 · **Status:** shipped  
**Implementation plan:** [plans/INIT-IMPLEMENTATION-PLAN-v2.md](plans/INIT-IMPLEMENTATION-PLAN-v2.md) (pattern-based, hybrid distribution) — supersedes the original Phase A/B plan  
**When:** First `jejak` command in a target repo. Bootstraps trace storage, determines which agent adapter to use, and records the distribution **mode**.  
**Depends on:** git work tree; **not** the jejak package repo. In a Node repo `jejak` need only be runnable (project devDependency); for global mode, `jejak` on PATH.

**Syntax:** `jejak init [--agent <id>] [--project | --global]`

| Flag | Purpose |
|---|---|
| `--agent <id>` | Skip interactive picker (CI). v0.1: `claude-code` only. |
| `--project` | Project mode: add jejak to `devDependencies` (default when a `package.json` exists). |
| `--global` | Global mode: assume a global install (default for non-Node repos). |

**Distribution mode** (committed in config as `mode`):

| Mode | Onboarding | Hooks (item 5) |
|---|---|---|
| `project` | author runs init once + commits; teammates just `npm install` (no per-dev init/setup) | portable `npx jejak` |
| `global` | each developer `npm i -g jejak` then `jejak init` + `jejak setup` | embed resolved CLI path |

**Agent detection** (runs first):

| Agent ID | Repo signals |
|---|---|
| `claude-code` | `.claude/settings.json`, `.claude/settings.local.json`, or `.claude/` |

**Picker** (`@inquirer/prompts`; TTY; skip with `--agent`). Full behavior: [INIT-IMPLEMENTATION-PLAN §5](plans/INIT-IMPLEMENTATION-PLAN.md#5-agent-detection).

| Detected | Action |
|---|---|
| **0** | List supported agents (v0.1: `claude-code` only); user picks |
| **1** | Confirm default (e.g. `Detected Claude Code. Use for jejak? [Y/n]`) |
| **2+** | List matches; user picks one supported adapter |

Write **committed `.jejak/config.json`** = `{ v, agent, mode }`. `dev_handle` is **not** stored — it is resolved per-developer at runtime (`git config jejak.handle` → `user.name` → email). Schema: [INIT-IMPLEMENTATION-PLAN-v2](plans/INIT-IMPLEMENTATION-PLAN-v2.md).

**Repo bootstrap** (after agent chosen): orphan shadow ref + seed tree (`.gitattributes` on **shadow ref only** — not working tree), `git config merge.ours.driver true`, `.jejakignore`; in project mode also add the `devDependencies.jejak` entry. The shadow-ref + handle bootstrap is **idempotent** so the capture/hook path can run it lazily for teammates. **No** hook merge — use `jejak setup`.

**Success:** reports `agent`, `mode`, `dev_handle`, `shadow`, `config`; ends with mode-specific `Next:` steps.

**Exit codes:** 0 ok · 1 not a git repo / self-setup refusal / invalid `--agent` / no TTY without `--agent` / dev-handle resolution failure / git plumbing failure · 130 user cancelled picker (SIGINT)

**Test project:** empty repo → picker; repo with `.claude/` → single-agent confirm; `--agent claude-code` non-interactive.

---

### `jejak setup`

**Item:** 5 · **Status:** shipped  
**When:** After `jejak init`. **Configure** hooks for one agent — **not** `npm install`.  
**Depends on:** init done; `config.agent` matches flag. User guide: [`docs/user/setup.md`](user/setup.md).

**Syntax:** `jejak setup --claude-code [--force]`

| Flag | Purpose |
|---|---|
| `--claude-code` | Configure Claude Code hooks + `prepare-commit-msg` (required v0.1) |
| `--force` | Re-embed `JEJAK_CLI` after `npm update -g jejak` |

v0.1: no bare `jejak setup` — exit **2** with hint to pass `--claude-code`.

**Behavior:** resolve the CLI invocation from `config.mode` (`npx jejak` in project mode, the
resolved absolute path in global mode); **additively merge** jejak's `SessionStart`/`Stop`/
`SessionEnd` hooks into `.claude/settings.json` (idempotent; **never clobbers** foreign hooks);
install the `prepare-commit-msg` git hook (leaves a foreign one untouched with a warning);
self-setup refusal; does **not** create the shadow ref.

**Mismatch:** `config.agent` ≠ `--claude-code` → exit **1**. Not initialized → exit **1**. Bare (no agent flag) → exit **2**.

**Test project:** see [IMPLEMENTATION-ORDER.md §5](IMPLEMENTATION-ORDER.md#5-capture-loop-hooks--worker).

---

### Update workflow (`npm update -g`)

**Item:** 2 · **Status:** spec  
**When:** After `npm update -g jejak` (or `pnpm update -g jejak`).  
**Depends on:** `jejak setup` previously run in target repo.

**Behavior (global mode):** Hook scripts embed the resolved CLI path at setup time. Re-run `jejak setup --claude-code --force` to refresh hooks. Full `jejak doctor` (item 6) flags stale embedded version ≠ `jejak --version`.

**Project mode:** the jejak version is pinned in `package.json` and hooks call `npx jejak`, so `npm install` (or bumping the devDependency) refreshes the CLI — no `--force` re-embed needed.

---

### Remaining verbs (stubs — fill in during item 2)

- `jejak status` — item 6
- `jejak active-session-id` — item 5 ([DESIGN-LLD §16.5](DESIGN-LLD.md#165-jejak-active-session-id-c-2))
- `jejak log` / `show` / `link` — item 6
- `jejak push` / `fetch` — item 6 (PII gate)
- `jejak attach` — item 6 ([DESIGN-LLD §16.4](DESIGN-LLD.md#164-jejak-attach-session-id-ai-1-v3-2))
- `jejak doctor` / `--trace` — item 5 minimal, item 6 full
- `jejak uninstall` — item 6

---

## Verb coverage (CI)

Public `jejak --help` subcommands must match [scripts/expected-verbs.json](../scripts/expected-verbs.json). Excludes hidden `_hook` / `_dev`. Enforced by `pnpm check:verbs`.
