# `jejak init` — implementation plan (pattern-based, modular)

> Architecture: **hybrid distribution** (project devDependency preferred, global fallback) +
> **polyglot** repos. Config is **committed**; `dev_handle` resolved lazily; shadow-ref + handle
> bootstrap are **idempotent** (reused by hooks). This revision restructures the code into small,
> single-responsibility files using explicit design patterns so `cli.ts` and `runInit` never
> become god-files.

---

## 1. Design patterns used (and why)

| Pattern | Applied to | Why / pays off when |
|---|---|---|
| **Command (module-per-verb)** | `commands/*.command.ts` + registry | `cli.ts` becomes a thin loop; adding `setup`/`status`/… is one new file, not edits to a growing switchboard |
| **Adapter + Registry** | `agents/` (`AgentAdapter`, `ClaudeCodeAdapter`, `CursorAdapter`) | Cursor/Codex land as new adapter files; detection/picker code never changes |
| **Strategy** | `modes/` (`ProjectMode` vs `GlobalMode`) | project/global behave differently (devDep add vs not, hook invocation, guidance); isolate the divergence |
| **Chain of Responsibility** | `handle/` ordered `HandleSource[]` | dev_handle fallback chain (jejak.handle → user.name → email); add/reorder a source without touching the runner |
| **Pipeline / Pipes-and-Filters** | `init/steps/*` ordered `InitStep[]` | `runInit` is a tiny runner over composable, individually-testable steps |
| **Facade** | `git/GitClient.ts` over the `git` CLI | one seam for all plumbing; everything else speaks typed methods, not argv |
| **Repository** | `config/ConfigStore`, `shadow/ShadowRepository` | persistence isolated behind intent-named methods |
| **Dependency Injection** | `InitContext` carries `git`, `prompter`, `reporter` | unit tests inject fakes (no real git repo / no TTY); steps stay pure |

---

## 2. Layered module structure

```mermaid
flowchart TD
  subgraph L1["CLI layer (thin)"]
    CLI["cli.ts"] --> REG["commands/index.ts registry"]
    REG --> CMD["commands/*.command.ts (init real, rest stubs)"]
  end
  subgraph L2["Orchestration (Pipeline)"]
    CMD --> RUN["init/runInit.ts"]
    RUN --> CTX["init/InitContext.ts"]
    RUN --> STEPS["init/steps/* (InitStep[])"]
  end
  subgraph L3["Domain services"]
    STEPS --> AG["agents/ (Adapter+Registry)"]
    STEPS --> MODE["modes/ (Strategy)"]
    STEPS --> HAND["handle/ (Chain of Responsibility)"]
    STEPS --> CONF["config/ConfigStore"]
    STEPS --> SH["shadow/ShadowRepository"]
    STEPS --> WS["workspace/WorkspaceFiles"]
  end
  subgraph L4["Infrastructure (Facade)"]
    HAND --> GIT["git/GitClient"]
    SH --> GIT
    SH --> CONST["shadow/constants.ts"]
    RUN --> PR["prompt/Prompter (+InquirerPrompter)"]
    GIT --> CP([" node:child_process → git "])
    PR --> INQ([" @inquirer/prompts "])
  end
  HOOK["(item 5) hook dispatcher"] -.reuses.-> HAND
  HOOK -.reuses.-> SH
```

---

## 3. Directory / file layout

```
src/
├── cli.ts                         # build program, iterate command registry (≈15 lines)
├── version.ts  · types.ts  · errors.ts   # errors.ts: InitError(exitCode), GitError
├── app/
│   └── AppDeps.ts                 # { git, prompter, reporter } container (DI root)
├── commands/
│   ├── index.ts                   # CommandModule[] registry
│   ├── CommandModule.ts           # interface { name; register(program, deps) }
│   ├── init.command.ts            # REAL → runInit
│   └── {setup,status,log,show,link,push,fetch,attach,doctor,uninstall,active-session-id}.command.ts  # thin stubs (still split out)
├── init/
│   ├── runInit.ts                 # pipeline runner over steps
│   ├── InitContext.ts             # shared mutable context + injected deps
│   └── steps/
│       ├── InitStep.ts            # interface { name; run(ctx) }
│       ├── GuardStep.ts           # git worktree + self-setup refusal
│       ├── ResolveModeStep.ts     # Strategy selection
│       ├── ResolveAgentStep.ts    # Adapter registry + picker
│       ├── WriteConfigStep.ts     # ConfigStore.write
│       ├── ProjectDepStep.ts      # project-mode devDep add (Strategy hook)
│       ├── EnsureShadowRefStep.ts # ShadowRepository.ensure
│       ├── WorkspaceFilesStep.ts  # .jejakignore
│       └── SummaryStep.ts         # reporter output + next steps
├── agents/
│   ├── AgentAdapter.ts            # interface
│   ├── registry.ts                # adapters + detectAll/findSupported/validate
│   ├── ClaudeCodeAdapter.ts       # supported
│   └── CursorAdapter.ts           # unsupported (detect-for-messaging)
├── modes/
│   ├── ModeStrategy.ts            # interface
│   ├── ProjectMode.ts  · GlobalMode.ts
│   └── detectMode.ts              # package.json presence + flags
├── handle/
│   ├── HandleResolver.ts          # runs sources in order (CoR)
│   ├── sources.ts                 # HandleSource[] (jejak.handle→user.name→email)
│   └── slugify.ts
├── config/
│   └── ConfigStore.ts             # committed .jejak/config.json (Repository)
├── workspace/
│   └── WorkspaceFiles.ts          # .jejakignore writer (service; WorkspaceFilesStep calls it)
├── prompt/
│   ├── Prompter.ts                # interface (confirm/select, isInteractive)
│   └── InquirerPrompter.ts        # @inquirer/prompts impl; SIGINT→exit 130
├── git/
│   └── GitClient.ts               # Facade over git CLI
└── shadow/
    ├── constants.ts               # SHADOW_REF, SHADOW_VERSION, seed files, .gitattributes
    └── ShadowRepository.ts        # ensure() (Phase A) + upsert() STUB (Phase B)
tests/
├── commands/init.command.test.ts
├── init/steps/*.test.ts           # each step with fake deps
├── agents/registry.test.ts
├── handle/{resolver,slugify}.test.ts
├── config/ConfigStore.test.ts
├── modes/detectMode.test.ts
└── integration/init.git.test.ts   # real temp git repo
```

---

## 4. Key interfaces (class diagram)

```mermaid
classDiagram
  class CommandModule {
    <<interface>>
    +string name
    +register(program, deps AppDeps) void
  }
  class AppDeps {
    +GitClient git
    +Prompter prompter
    +Reporter reporter
  }
  class InitStep {
    <<interface>>
    +string name
    +run(ctx InitContext) Promise
  }
  class InitContext {
    +string cwd
    +string repoRoot
    +InitFlags flags
    +JejakConfig? existing
    +ModeStrategy mode
    +AgentAdapter agent
    +string handle
    +GitClient git
    +Prompter prompter
    +Reporter reporter
    +InitResults results
  }
  class AgentAdapter {
    <<interface>>
    +AgentId id
    +string label
    +bool supported
    +string[] signalPaths
    +detect(repoRoot) bool
  }
  class ModeStrategy {
    <<interface>>
    +JejakMode mode
    +prepare(ctx) Promise
    +nextSteps(ctx) string[]
  }
  class HandleSource {
    <<interface>>
    +resolve(ctx) Promise~string?~
  }
  class Prompter {
    <<interface>>
    +bool isInteractive
    +confirm(msg, defYes) Promise~bool~
    +select(msg, choices) Promise~T~
  }
  class GitClient {
    +repoRoot(cwd) string
    +refExists(ref) bool
    +hashObject(content) string
    +writeTreeFromIndex(entries) string
    +commitTree(tree, msg) string
    +updateRefCAS(ref, sha) void
    +getConfig(key, global) string?
    +setConfig(key, val) void
  }
  class ConfigStore {
    +read(repoRoot) JejakConfig?
    +write(repoRoot, cfg) void
  }
  class ShadowRepository {
    +ensure() EnsureResult
    +upsert() never_STUB
  }
  CommandModule --> AppDeps
  InitContext --> ModeStrategy
  InitContext --> AgentAdapter
  InitContext --> GitClient
  InitContext --> Prompter
  InitStep --> InitContext
  ShadowRepository --> GitClient
  ConfigStore --> JejakConfig
  ClaudeCodeAdapter ..|> AgentAdapter
  CursorAdapter ..|> AgentAdapter
  ProjectMode ..|> ModeStrategy
  GlobalMode ..|> ModeStrategy
  InquirerPrompter ..|> Prompter
```

---

## 5. `cli.ts` after refactor (Command pattern)

```mermaid
flowchart LR
  A["createProgram()"] --> B["new Command('jejak')"]
  B --> C["for cmd of COMMAND_REGISTRY"]
  C --> D["cmd.register(program, deps)"]
  D --> E["init.command → action: runInit(ctx)"]
  D --> F["setup.command → stub action"]
  D --> G["…other verbs → stub action"]
```
`cli.ts` shrinks to building `AppDeps` + looping the registry. `PUBLIC_COMMAND_NAMES` is
derived from the registry (keeps `verb-coverage.test.ts` green).

---

## 6. init pipeline (Pipeline pattern) — runtime sequence

```mermaid
sequenceDiagram
  participant R as runInit
  participant C as InitContext
  participant S as steps[]
  R->>C: build context (cwd, flags, inject git/prompter/reporter)
  loop each InitStep (ordered)
    R->>S: step.run(ctx)
    Note over S,C: step reads/mutates ctx; throws InitError to abort
  end
  Note over R: GuardStep → ResolveModeStep → ResolveAgentStep →<br/>WriteConfigStep → ProjectDepStep → EnsureShadowRefStep →<br/>WorkspaceFilesStep → SummaryStep
  R->>C: reporter.flush() → summary + Next: jejak setup
```

Each step is independently unit-tested with a fake `GitClient`/`Prompter` — no real git or TTY.

---

## 7. dev_handle (Chain of Responsibility)

```mermaid
flowchart TD
  H["HandleResolver.resolve(ctx)"] --> L["for src of sources[]"]
  L --> S1["RepoConfigSource: git config jejak.handle"]
  S1 -->|null| S2["GlobalConfigSource: git config --global jejak.handle"]
  S2 -->|null| S3["UserNameSource: user.name → slugify"]
  S3 -->|null| S4["EmailSource: user.email local-part → slugify"]
  S1 -->|value| OUT[handle]
  S2 -->|value| OUT
  S3 -->|value| OUT
  S4 -->|value| OUT
  S4 -->|null| FAIL["InitError exit 1"]
```

## 8. Shadow-ref bootstrap (Facade + Repository) — git plumbing

```mermaid
sequenceDiagram
  participant SR as ShadowRepository.ensure()
  participant G as GitClient (Facade)
  SR->>G: refExists(SHADOW_REF)
  alt exists
    G-->>SR: {created:false}
  else build
    SR->>G: hashObject(seed file) ×3
    SR->>G: writeTreeFromIndex(entries)  (temp GIT_INDEX_FILE)
    SR->>G: commitTree(tree, msg)  (orphan, no -p)
    SR->>G: updateRefCAS(SHADOW_REF, commit)  (CAS "")
  end
  SR->>G: setConfig("merge.ours.driver","true")
```
Seed tree (shadow ref only): `.gitattributes` (`sessions/** merge=ours` ·
`index/**/by-commit.ndjson merge=union` · `*.jsonl.gz binary`), `README.md`, `VERSION=1`.

---

## 9. Build order (suggested commit slices)

```mermaid
flowchart LR
  P1["1. git/GitClient + errors + shadow/constants"] --> P2["2. agents/ (adapters+registry)"]
  P2 --> P3["3. handle/ (resolver+sources+slugify)"]
  P3 --> P4["4. config/ConfigStore + modes/ + prompt/"]
  P4 --> P5["5. shadow/ShadowRepository.ensure"]
  P5 --> P6["6. init/steps/* + InitContext + runInit"]
  P6 --> P7["7. commands/ registry + cli.ts refactor"]
  P7 --> P8["8. tests (unit per module + integration)"]
```

Each slice compiles + is unit-tested before the next. `commands/` refactor (slice 7) also
moves the existing stub verbs into their own files — directly fixing the "cli.ts gets big"
concern across the whole CLI, not just init.

---

## 10. Testing (DI makes this clean)

- **Per-module units (no git, no TTY):** inject `FakeGitClient` + `FakePrompter`.
  - `slugify` / `HandleResolver` chain · `agents/registry` detect 0/1/many + cursor unsupported
  - `detectMode` project/global/flags · `ConfigStore` round-trip + re-init merge
  - each `InitStep` in isolation (Guard refusal, ResolveAgent picker paths, ProjectDep add, etc.)
- **Integration (real temp git repo, `mkdtemp`+`git init`):** `integration/init.git.test.ts`
  asserts project vs global config, `git show-ref` ref creation, seed-tree contents,
  `merge.ours.driver=true`, idempotent re-init (sha unchanged, exit 0), refusal exit 1,
  no-TTY exit 1, SIGINT exit 130.

---

## 11. Design docs to reconcile (encode old global-only model)
`INIT-IMPLEMENTATION-PLAN.md` (hybrid + mode; flip Q2; drop dev_handle from schema) ·
`DESIGN-LLD.md §2` (distribution + handle chain) · `CLI-SPEC.md` (`--project`/`--global`,
committed config, project-mode teammate flow) · `IMPLEMENTATION-ORDER.md` (setup wires
portable `npx jejak` vs embedded path; never clobber existing `.claude` hooks).

## 12. Deferred
`jejak setup` hook wiring + conflict UX (item 5) · `ShadowRepository.upsert`/fixtures
(item 3 / Phase B) · `jejak view` webserver (same distribution channel; lazy deps) ·
Cursor/Codex adapters (interfaces ready, impls later).

---

# Part B — Plan-validation skills (project guardrails)

Encode the principles above as **committed Claude Code skills** under `.claude/skills/` so
every future plan in this repo is validated against the same rubric (and the team shares them).

## B1. Skill mechanism
Each skill = `.claude/skills/<name>/SKILL.md` with frontmatter:
```
---
name: <skill-name>
description: <when to trigger — e.g. "Use when writing or reviewing an implementation plan for jejak to validate its <dimension>.">
---
<rubric: ordered criteria, each with PASS/GAP/N-A + required-evidence + fix template>
```
Body instructs Claude: read the target plan (arg path or the active plan), evaluate each
criterion, output a table `criterion → verdict → evidence → fix`, end with a GAP count.

## B2. Non-overlapping skill set (each owns a disjoint dimension)

```mermaid
flowchart TD
  UMB["/validate-plan (umbrella, optional)"] --> A["plan-architecture<br/>patterns + modularity"]
  UMB --> B["plan-distribution<br/>onboarding/distribution"]
  UMB --> C["plan-git-safety<br/>shadow-ref/git invariants"]
  UMB --> D["plan-testability<br/>DI, unit/integration, exit codes"]
  UMB --> E["plan-docs-consistency<br/>CLI-SPEC/DESIGN-LLD/ORDER + R-n"]
```

| Skill | Disjoint criteria (no overlap across skills) |
|---|---|
| `plan-architecture` | Command-per-verb (no god cli.ts) · Adapter+Registry (agents) · Strategy (modes) · CoR (fallback chains) · Pipeline (orchestration) · Facade (git) · Repository (persistence) · DI seams · single-responsibility files · feature-grouped dirs |
| `plan-distribution` | hybrid project+global · polyglot (no Node-only assumption) · committed-vs-per-dev config split · no per-dev install/init anti-pattern · lazy idempotent bootstrap reused by hooks · dev_handle not committed |
| `plan-git-safety` | never checkout shadow ref · orphan commit (no -p) · CAS update-ref · merge.ours.driver registered · .gitattributes seed-tree-only · merge=union for index · idempotency matrix |
| `plan-testability` | DI fakes (no real git/TTY in units) · unit vs integration split · exit-code assertions · failure-path coverage |
| `plan-docs-consistency` | no contradiction w/ CLI-SPEC/DESIGN-LLD/IMPLEMENTATION-ORDER · lists doc updates on locked-decision change · honors resolved review findings (R-n) |

`validate-plan` (umbrella) only **sequences** the five and aggregates a scorecard — it holds
no criteria itself, so each rubric stays single-source.

## B3. Files to create (on approval)
```
.claude/skills/
├── validate-plan/SKILL.md          # umbrella (optional)
├── plan-architecture/SKILL.md
├── plan-distribution/SKILL.md
├── plan-git-safety/SKILL.md
├── plan-testability/SKILL.md
└── plan-docs-consistency/SKILL.md
```
Scope: **project** (`.claude/skills/`, committed) so they're team-shared and repo-relevant.
Invocation: manual (`/plan-architecture …`) or auto via `description` when a plan is in play.

**Decided:** 5 focused skills **+** `/validate-plan` umbrella; **project-scoped** `.claude/skills/`.

---

# Execution order (on approval)

```mermaid
flowchart LR
  S1["1. Create 6 skills in .claude/skills/<br/>(Part B)"] --> S2["2. Save this plan to<br/>docs/plans/INIT-IMPLEMENTATION-PLAN-v2.md"]
  S2 --> S3["3. Run /validate-plan on the init plan<br/>→ fix any GAPs"]
  S3 --> S4["4. Implement init (Part A)<br/>build slices 1→8, tests green"]
  S4 --> S5["5. Reconcile design docs (§11)"]
```

Phases 1–3 are docs/skills only (no source code). I will **pause after phase 3** and report the
`/validate-plan` scorecard before touching `src/` — so the guardrails get applied to this plan
first, exactly as intended. No code until you approve continuing to phase 4.
