# Proposal — Commit-time reconcile (self-healing capture)

> **Status:** Proposal / RFC · **Target:** v0.2 · **Author:** design discussion, 2026-06-02
>
> Move the *heavy* capture work off the per-turn hot path and onto a **self-healing commit-time
> reconcile** that re-derives the shadow ref from the durable transcripts on disk. Keep a thin
> session-lifecycle hook for accurate commit↔session linking and a detached net for
> non-committing sessions. Net effect: zero per-turn overhead, fault-tolerance by construction,
> and a capture path that catches up on its own after any crash, skip, or stale-state event.

## Context

Today capture is decoupled from git commits and spread across three Claude Code agent hooks plus
one git hook:

- `SessionStart` → opens/resumes a row in the SQLite ledger (this is what makes linking possible).
- `Stop` → **per-turn** partial snapshot, bounded to Claude's ~3 s Stop timeout.
- `SessionEnd` → detached worker runs the final strip → PII → gzip → shadow write.
- `prepare-commit-msg` → stamps one `Jejak-Session:` trailer per open session (links commit↔session).

This works (v0.1 ships it) but has two structural costs:

1. **Per-turn overhead.** The `Stop` snapshot runs on *every* turn. It is the only thing adding
   latency inside the session, and it exists mostly as crash-insurance.
2. **State-dependence.** Correct capture depends on the mutable local ledger (`last_offset`,
   `status`) being right. A crashed hook, a killed worker, or a stale watermark can leave a
   session partially captured with no automatic recovery path.

The transcripts Claude Code writes to `~/.claude/projects/<project-id>/<session-id>.jsonl` are the
**real source of truth** and are durable on disk. The shadow ref already supports idempotent,
re-derivable writes (content-addressed payloads + tree-hash dedup). That combination makes a
"re-derive the delta on every commit" loop attractive: it is **self-healing by construction** — a
missed or crashed capture is simply picked up by the next commit.

- **Tracks:** new (v0.2) · **Design refs:** DESIGN-LLD §5 (lifecycle), §6 (hook contract), §10 (shadow write path), §10.5 (trailers), §14 (ledger), §15 (push / PII gate) · LESSONS-FROM-FINN §2–§4
- **Builds on:** `ShadowRepository.upsert`/`ensure` (item 4), `SnapshotWorker` strip→stage→upsert (item 5), `SessionLedger` (item 5), `prepare-commit-msg` trailers (item 5), `CatalogPiiScanner` (item 6).
- **Relationship to roadmap:** this is the concrete realization of the "Path B / post-commit condensing" direction already anticipated in the design docs.

---

## 1. Inspiration & motivation

The idea came from a simple observation: **the transcripts are durable, so most of jejak's mutable
local state is redundant.** If you can cheaply diff "what's on disk" against "what's in the shadow
ref," you never need to trust that every in-session hook fired correctly — you just reconcile.

Three properties make this the right shape:

- **The source of truth survives crashes.** Claude's JSONL transcript is append-only and on disk.
  Anything jejak failed to capture is still recoverable from it later.
- **The shadow ref is already idempotent.** `upsert` is a true no-op when the composed tree equals
  the current tip (`ShadowRepository.ts:92-94`), and bulk content is content-addressed
  (`payloads/<sha256>`). Re-running capture with nothing new costs one tree compare.
- **`git commit` is a natural, meaningful checkpoint.** It is the moment the developer declares "this
  work matters," and it is exactly where we already stamp linking trailers.

### Why not commit-time *only*

Replacing the hooks entirely with a single commit-time pull **fails jejak's core purpose** and is
explicitly out of scope for this proposal. Recorded here so the trade-off isn't relitigated:

1. **Non-committing sessions vanish.** Research, debugging, code reading, abandoned attempts — most
   sessions never produce a commit. A commit-only trigger never captures them.
2. **Linking gets lossy.** Without `SessionStart` recording which sessions are *open*, commit-time
   attribution degrades to "guess which transcripts belong to this commit," which is wrong under
   interleaving / multiple agents / multiple branches.
3. **Cost moves onto the blocking path.** `git commit` is the most frequent blocking git op;
   synchronously stripping/PII-scanning/gzipping a multi-MB transcript there is a multi-second stall.

So reconcile **complements** a thin hook layer; it does not replace it.

---

## 2. Proposed design

### 2.1 Target hook topology

| Hook | Keep? | Role after this change |
|---|---|---|
| `SessionStart` | **Keep** | Cheap ledger open/resume. Sole reliable source of commit↔session linking. |
| `Stop` (per-turn) | **Drop or lighten** | Redundant once reconcile re-derives from the durable transcript. This is where the in-session speedup comes from. |
| `SessionEnd` | **Keep** | Detached net for sessions that never commit. Runs the broad idempotent sweep. |
| `prepare-commit-msg` | **Keep** | Unchanged: one `Jejak-Session:` trailer per open session. |
| `post-commit` (new) | **Add** | Triggers the commit-time reconcile (detached, fail-open). |

> **Why `post-commit`, not `prepare-commit-msg`, for the reconcile:** `prepare-commit-msg` runs
> *before* the commit exists, must stay fast (it's already doing trailer work), and a slow/aborted
> message edit would couple commit reliability to capture. `post-commit` runs *after* the SHA
> exists, so the reconcile can read the real commit and back-fill `meta.commit_sha` immediately,
> and it can spawn detached without affecting the commit at all.

The `Stop` behavior is governed by a single **committed, repo-wide** config key
(`capture.stopSnapshot: off | partial`) — it belongs in the committed shared config alongside
`agent`/`mode`, **not** in per-developer local state. Capture cadence is a team decision; resolving
it per-dev would let two teammates produce divergent shadow histories for the same repo. (Per-dev
state — the `handle`, watermarks, ledger — stays local as today; only this behavioral toggle is
committed.)

### 2.2 What "reconcile" does (scoped, not global)

Each commit's reconcile is **scoped to the session(s) attributed to that commit** — the ones the
ledger reports as open for this agent (the same set `prepare-commit-msg` just stamped). This is the
fast, contention-free path. Steps:

1. Read the trailers on the new `HEAD` commit (`git log -1 --format=%B`) → the set of session IDs.
2. For each session, read its transcript from the **stored watermark** to the current safe end
   (last complete JSONL line), strip → PII-scan → compose, and `upsert` to the shadow ref.
3. Back-fill `meta.commit_sha = HEAD` for those sessions.

The **broad "catch everything new"** sweep — including non-committing and other-agents' sessions —
runs from the detached `SessionEnd` worker (and optionally a low-frequency idle pass), guarded by
the same per-session lock + watermark so it's idempotent against the commit-time path.

### 2.3 Authoritative, monotonic watermark in the shadow ref

The keystone correctness change. Today the watermark (`last_offset`) lives only in the local
ledger. Move the **authoritative** copy into the session's `meta.json` on the shadow ref, and make
`upsert` enforce monotonicity:

> **Compare-and-skip:** if the incoming end-offset ≤ the offset already stored in the shadow's
> `meta.json` for this session, the write is a **no-op**.

This single guard makes the system idempotent under concurrency *regardless of who writes* — a
reconcile, a `SessionEnd` worker, and a lingering `Stop` snapshot can all race and the shorter/older
write simply loses. The local ledger becomes a cache/accelerator, not the source of truth.

---

## 3. Concurrency model (the hard part)

"Multiple agents committing" splits into three contention classes. Two are already solved; one is
the reason this proposal exists.

### 3.1 Different sessions racing at the ref → already safe

`ShadowRepository.upsert` (lines 88–105) already handles this with CAS + rebase-onto-new-tip: the
loser re-reads the new tip and recomposes its own session path on top, so both land. Different
session paths + content-addressed payloads ⇒ no overwrite, no dup. ✅

**Caveat:** `CAS_RETRIES = 5` (line 28) can be exhausted when many committers each touch many
sessions. See gotcha G-2.

### 3.2 The *same* session written by two committers → the real hazard

`events.jsonl.gz` is a **full-overwrite blob** — `hashObject(gzip(entire eventsJsonl))`
(`ShadowRepository.ts:80,83`). CAS guarantees *someone's* tree wins atomically; it does **not**
guarantee the winner's content is a superset:

```
Writer A: transcript read to offset E1            Writer B: read to offset E2 > E1
B wins CAS  → shadow has [0, E2]
A lost      → rebases entries onto B's tip
            → OVERWRITES events.jsonl.gz with its shorter [0, E1]   ← silent regression
```

Tree-hash dedup (line 92) does **not** catch this because the trees differ. Today this never
happens because `SingleFlight` enforces one writer per session. **The trap:** a broad reconcile
("capture all new sessions") turns every commit into a writer for *every* live session, so two
concurrent commits become two concurrent writers for the **same** session.

**Mitigations (apply both):**
- **Monotonic compare-and-skip** (§2.3) — turns the shorter overwrite into a rejected no-op.
- **Per-session `SingleFlight` lock** reused in the reconcile path — serializes writers to a session.
- **Scoped reconcile** (§2.2) further reduces the surface: a session belongs to one agent, so
  scoped reconciles rarely contend on the same session in the first place.

> Long-term structural fix (out of scope, noted for v0.3): chunk events as append-only parts
> `events/<zero-padded-offset>.jsonl.gz`. Concurrent writers then touch **disjoint paths**, collapsing
> §3.2 back into the already-safe §3.1 and giving `merge=union` semantics for free.

### 3.3 Same bytes twice (duplication) → already safe

Offset watermark + content-addressed payloads + tree-hash dedup. Re-running reconcile with nothing
new is a no-op (`ShadowRepository.ts:92-93`). The monotonic guard hardens this further. ✅

### 3.4 Cross-machine (different developers) → orthogonal

Not a CAS problem — handled at push/fetch: per-`handle` namespacing (no two devs write the same
path), `merge=ours` on immutable session blobs, `merge=union` on the index ndjson. Unaffected by
the commit-time-vs-hook-time choice. ✅

---

## 4. Advantages

- **Zero per-turn overhead.** Dropping/lightening `Stop` removes the only in-session latency source.
- **Fault-tolerant by construction.** Any missed, crashed, or partial capture is re-derived from the
  durable transcript on the next commit. No manual `doctor --repair` needed for the common case.
- **Less trusted mutable state.** With the authoritative watermark in the shadow ref, a corrupted or
  deleted local ledger self-heals — it's a cache, not the source of truth.
- **Accurate linking preserved.** `SessionStart` + `prepare-commit-msg` keep the precise
  commit↔session attribution that a commit-only model would lose.
- **Non-committing sessions still captured.** The `SessionEnd` net plugs the hole.
- **Idempotent under concurrency.** Monotonic compare-and-skip makes concurrent writers safe even
  without perfect locking.
- **Aligned with the roadmap.** Concrete realization of the anticipated Path B direction; no new
  storage format required for v0.2.

---

## 5. Implementation gotchas

| # | Gotcha | Guard |
|---|---|---|
| **G-1** | **Same-session overwrite (§3.2).** `events.jsonl.gz` is a full-overwrite blob; a stale/short writer silently regresses a session. | Monotonic compare-and-skip in `upsert` **and** per-session `SingleFlight` in the reconcile path. Non-negotiable. |
| **G-2** | **CAS retry exhaustion.** `CAS_RETRIES = 5` can be blown under N concurrent committers each writing many sessions. | Raise the bound + add exponential backoff with jitter, or take a coarse machine-local reconcile lock so commit-time reconciles serialize instead of livelock. |
| **G-3** | **Reading a live transcript.** Another agent may be mid-write to the JSONL while reconcile reads it. | Read only up to the last *complete* line; advance the offset to that boundary (the existing `ClaudeCodeJsonlReader` already does this). Never read a partial trailing line. |
| **G-4** | **Don't finalize someone else's session.** A broad reconcile sees other agents' *live* transcripts. | Reconcile writes **partial deltas only**; only that session's `SessionEnd` may set terminal status. Never mark `status=ended` from another agent's commit. |
| **G-5** | **`post-commit` must be fail-open and fast.** A slow or throwing reconcile must never affect the commit (which has already succeeded) or the shell. | `post-commit` spawns the reconcile **detached** (reuse `WorkerSpawner`), exits 0 unconditionally, checks `.jejak/disabled` first. |
| **G-6** | **PII gate still applies.** Reconcile is a capture path; it must not write un-scanned content to a pushable surface. | Route reconcile through the same `CatalogPiiScanner`; honor the push hard-gate (DESIGN-LLD §15). Don't add a bypass. |
| **G-7** | **Trailer back-fill races.** Reconcile back-fills `meta.commit_sha`; a later rebase/amend/squash changes the SHA. | Trailer remains authoritative for linking (survives rewrite); `meta.commit_sha` is a convenience cache, recomputed on next reconcile. Don't treat it as canonical. |
| **G-8** | **Watermark migration.** Existing sessions have offsets only in the ledger, not in `meta.json`. | On first reconcile of a pre-existing session, seed `meta.json` offset from the ledger (or from `events.jsonl.gz` length); treat missing shadow offset as 0 = "capture from start," relying on tree-hash dedup to avoid dup work. This resolution order (shadow `meta.json` → ledger → blob length → 0) is small today; keep it behind a single `resolveWatermark()` helper (a thin source-list runner, Chain-of-Responsibility style) so it doesn't grow into an inline if/else ladder inside `ReconcileWorker`. |
| **G-9** | **Squash/rebase fan-out.** One squashed commit may carry many `Jejak-Session:` trailers; an interactive rebase replays many commits, each firing `post-commit`. | Reconcile is idempotent (monotonic guard), so replays are no-ops after the first. Bound work per fire; don't assume one session per commit. |
| **G-10** | **Repos without the new hook.** Teammates who set up before this lands won't have `post-commit`. | `jejak setup` re-runs idempotently and installs the new hook additively (no-clobber merge, preserve foreign `post-commit`); `jejak doctor` flags a missing reconcile hook. |

---

## 6. Implementation sketch

Phased so each step is shippable and reversible.

### Phase A — Harden `upsert` with the monotonic watermark (ship first, independently valuable)
- Add `endOffset` to `UpsertInput` and persist it in `meta.json`.
- In `upsert`, before composing: read the session's current shadow `meta.json` offset; if
  `incoming.endOffset <= stored`, return a no-op. Keep tree-hash dedup as the second line of defense.
- This alone hardens the existing `SessionEnd`-vs-`Stop` race (G-1) regardless of the rest.

### Phase B — Reconcile engine + `post-commit` hook
- New `capture/ReconcileWorker.ts`: given a set of session IDs (or "all open"), for each session
  acquire the per-session `SingleFlight` lock, read transcript from stored offset → strip → scan →
  `upsert`, back-fill `meta.commit_sha`.
- New `hooks/PostCommitHandler.ts`: read trailers on `HEAD`, spawn `ReconcileWorker` **detached**
  for that scoped set, exit 0. Wrap in the existing `failOpen()` decorator.
- New git-hook wrapper `adapters/claude-code/git-hooks/post-commit` (3-line bash, mirrors
  `prepare-commit-msg`).
- `ClaudeCodeHookInstaller`: install `post-commit` additively; `settingsMerge` unaffected (git hook,
  not agent hook).

### Phase C — Repoint the net & lighten the hot path
- Move the broad "catch everything new" sweep into the `SessionEnd` detached worker (reuse
  `ReconcileWorker` with "all open" scope).
- **Drop or feature-flag the per-turn `Stop` snapshot.** Gate behind a config
  (`capture.stopSnapshot: off|partial`) so the change is reversible and crash-recovery cost is
  measurable before fully removing it.

### Phase D — Observability & docs
- `jejak doctor`: report last reconcile time, sessions with `commit_sha=null` (unlinked),
  watermark drift (shadow offset vs transcript length), and missing `post-commit` hook (G-10).
- `jejak doctor --trace`: surface reconcile timings and skip/no-op counts.
- **Forced doc updates** (locked-decision changes — file · section · what changes):
  - `DESIGN-LLD.md` §5 (Capture lifecycle) — add the `post-commit` reconcile step + `SessionEnd` broad sweep.
  - `DESIGN-LLD.md` §6.2 (Single-flight) — note reconcile reuses the per-session lock; clarify it now guards the commit-time path too.
  - `DESIGN-LLD.md` §6.3 (Hook registration v0.1) — add `post-commit`; mark `Stop` as drop/lighten behind `capture.stopSnapshot`.
  - `DESIGN-LLD.md` §10/§10.5 — document the authoritative monotonic offset in `meta.json`; `meta.commit_sha` is a back-fill cache, trailer stays authoritative (G-7).
  - `DESIGN-LLD.md` Δ-2 / §20 (Path B roadmap) — mark this proposal as the v0.2 realization of two-tier/post-commit condensing.
  - `CLI-SPEC.md` — add the committed `capture.stopSnapshot: off | partial` config key and the new `jejak doctor` reconcile fields; confirm `post-commit` exits 0 (fail-open, no new exit code).
  - `ARCHITECTURE.md` — update the capture-flow Mermaid diagram (add `post-commit` → reconcile; remove/annotate per-turn `Stop`).
  - `docs/user/` — onboarding note that re-running `jejak setup` installs `post-commit` (G-10).
- Run `docs-drift` (Tier 3) before merge.

---

## 7. Testing strategy

Use the project's DI seams (fakes for git, ledger, clock, spawner, fs, scanner) — no real git or TTY
in unit tests.

- **Monotonic guard (G-1):** two `upsert`s for one session, offsets `E2 > E1` applied in both orders
  ⇒ shadow always ends with `[0, E2]`; the shorter write is a no-op. Assert no regression.
- **Same-session concurrency (§3.2):** two `ReconcileWorker` runs against one session with disjoint
  and overlapping deltas ⇒ final events are the union/superset, never a clobber.
- **Different-session concurrency (§3.1):** N reconciles for N sessions ⇒ all land; assert CAS retry
  count stays under budget; add a contention test that would trip the old `CAS_RETRIES=5`.
- **Idempotency (§3.3):** run reconcile twice with no new bytes ⇒ second is a pure no-op (tree compare
  only, no commit).
- **Live-transcript safety (G-3):** reconcile against a transcript with a partial trailing line ⇒
  reads to the last complete line, offset stops at the boundary.
- **Fail-open (G-5):** `ReconcileWorker` throws ⇒ `post-commit` still exits 0; commit unaffected.
- **Non-committing capture:** session ends with no commit ⇒ `SessionEnd` net captures it; later
  commit referencing it back-fills `commit_sha`.
- **Linking under rewrite (G-7):** capture → amend/rebase the commit ⇒ trailer-based `jejak link`
  still resolves; `meta.commit_sha` recomputes on next reconcile.
- **Integration:** real git repo (tmp), real `post-commit` hook, scripted commits incl. squash and
  interactive-rebase replay (G-9) ⇒ idempotent, no dup commits on the shadow ref.

---

## 8. Rollout & backward compatibility

- **Additive.** Phase A is invisible behaviorally (only adds a no-op guard). Phases B–C are gated by
  the `post-commit` hook + `capture.stopSnapshot` flag, so old setups keep working until re-`setup`.
- **No storage-format change** for v0.2 (events stay single-blob; the optional chunked format is
  v0.3). The added `meta.json` offset field is forward/backward tolerant (missing ⇒ treat as 0).
- **Reversible.** Re-enable the `Stop` snapshot via config; uninstall the `post-commit` hook via
  `jejak uninstall` — the shadow ref is unaffected either way.
- **Migration:** first reconcile per legacy session seeds the shadow watermark (G-8); no offline
  migration step required.

---

## 9. Open questions

1. **Idle sweep?** Do we also want a low-frequency background reconcile (e.g. on `SessionStart`) to
   bound staleness for long-running non-committing work, or is the `SessionEnd` net sufficient?
2. **`Stop` removal vs. lighten.** Is partial crash-recovery between turns valuable enough to keep a
   *minimal* `Stop` watermark-bump (no full snapshot), or do we drop it entirely once reconcile lands?
3. **Reconcile scope default.** Scoped-to-commit (fast, contention-free) vs. broad (maximally
   self-healing) as the default `post-commit` behavior — or scoped on `post-commit` + broad on
   `SessionEnd` as proposed here?
4. **Chunked events timing.** Pull the v0.3 append-only chunk format forward if measured commit-time
   contention is high, since it removes the per-session lock dependency entirely.

---

## 10. References

- `src/shadow/ShadowRepository.ts` — `upsert` CAS loop (88–105), full-overwrite events blob (80,83),
  tree-hash dedup (92–94), `CAS_RETRIES` (28).
- `src/shadow/constants.ts` — `SHADOW_REF`, merge drivers (`merge=ours`, `merge=union`).
- `src/capture/SnapshotWorker.ts` — strip→stage→upsert pipeline, offset advance, final-mode backfill.
- `src/capture/SingleFlight.ts` — per-session flag-and-rerun lock.
- `src/ledger/SessionLedger.ts` — `last_offset`, `status`, `openOrResume`, `listOpen`.
- `src/hooks/PrepareCommitMsgHandler.ts` — trailer stamping at commit time.
- `src/git/GitClient.ts` — `findCommitWithTrailer`, plumbing wrappers.
- DESIGN-LLD §4, §5, §6, §10.5, §14, §15 · LESSONS-FROM-FINN §2–§4 · IMPLEMENTATION-ORDER.
