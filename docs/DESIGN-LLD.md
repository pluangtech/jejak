# Jejak — Low-Level Design (LLD)

**Status:** Implementation-ready  
**Version:** 0.4  
**Last updated:** 2026-05-30  
**Related:** [README.md](../README.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [LESSONS-FROM-FINN.md](LESSONS-FROM-FINN.md) · [REVIEW-LLD-v3.md](REVIEW-LLD-v3.md)

Implementation blueprint for Jejak v0.1. Incorporates [REVIEW-LLD.md](REVIEW-LLD.md), [REVIEW-LLD-v2.md](REVIEW-LLD-v2.md), and [REVIEW-LLD-v3.md](REVIEW-LLD-v3.md) (V3-1..C-4).

**Verdict:** Design complete. Code can start. Remaining input: dogfood cohort roster (§20 Q3).

---

## Table of contents

1. [Stress test pass](#1-stress-test-pass)
2. [Resolved design decisions](#2-resolved-design-decisions)
3. [System context](#3-system-context)
4. [Module layout](#4-module-layout)
5. [Capture lifecycle](#5-capture-lifecycle)
6. [Hook contract & async worker](#6-hook-contract--async-worker)
7. [Transcript reader](#7-transcript-reader)
8. [Stripper pipeline](#8-stripper-pipeline)
9. [PII dispatcher](#9-pii-dispatcher)
10. [Shadow branch write path](#10-shadow-branch-write-path)
11. [Storage layout](#11-storage-layout)
12. [Conflict-free merge](#12-conflict-free-merge)
13. [Pre-turn diff (v0.2)](#13-pre-turn-diff-v02)
14. [Ledger & session state](#14-ledger--session-state)
15. [Push / fetch](#15-push--fetch)
16. [Read path & diagnostics](#16-read-path--diagnostics)
17. [End-to-end data flow](#17-end-to-end-data-flow)
18. [Invariants checklist](#18-invariants-checklist)
19. [Build order](#19-build-order)
20. [Open questions & deferred work](#20-open-questions--deferred-work)

---

## 1. Stress test pass

### 1.1 Verdict

**Ship-ready.** All C-1..C-4 and I-1..I-5 findings resolved ([REVIEW-LLD.md](REVIEW-LLD.md)). Entire CLI comparison ([REVIEW-LLD-v2.md](REVIEW-LLD-v2.md)) yielded three conscious architectural choices — all addressed in this revision (Δ-1, Δ-2 Path A, Δ-3).

### 1.2 Original findings (ST-01..18)

| ID | Resolution |
|---|---|
| ST-01 | `refs/heads/jejak/sessions/v1` |
| ST-02 | `sessions/<handle>/<shard:2>/<session-id>/` (Δ-3; was month/handle) |
| ST-03 | Layer 2 union + explicit index concat (§12) |
| ST-04 | Upsert same path; flock on one machine |
| ST-05 | Single-flight + flag-and-rerun (§6.2) |
| ST-06 | Dedup on events content hash only |
| ST-07 | `blocked_event_ids` in meta; quarantine v0.2 |
| ST-08 | Stop snapshots + `jejak doctor` + opt-in watcher |
| ST-09 | Flock on `--git-common-dir` |
| ST-10 | NFS/iCloud unsupported; doctor warns |
| ST-11 | Trailers (§10.5) + meta anchors + index fallback |
| ST-12 | Shadow `.gitattributes` + index concat fallback |
| ST-13 | Default clone fetches shadow; document `--single-branch` |
| ST-14 | dev-handle resolution + sanitization (§2) |
| ST-15 | Hooks and watcher mutually exclusive |
| ST-16 | fetch → merge → push retry loop |
| ST-17 | Subagent defer v0.2 |
| ST-18 | ~19 GB/year with dedup; hash-sharding removes archival need |

### 1.3 Review v1 resolutions (C / I)

All ✅ — see [REVIEW-LLD.md Part 1](REVIEW-LLD.md).

### 1.4 Review v2 resolutions (Δ / AI)

| ID | Issue | Resolution |
|---|---|---|
| Δ-1 | Index breaks on rebase/amend | `Jejak-Session` commit trailer via `prepare-commit-msg` (§10.5) |
| Δ-2 | One-tier pushes every Stop to shared ref | **Path A v0.1:** staging safety net + PII hard gate; **Path B v0.2:** two-tier storage (§20) |
| Δ-3 | Month/handle hot directory | Hash-shard within handle: `sessions/<handle>/<shard:2>/<session-id>/` |
| AI-1 | No attach for missed captures | `jejak attach` in v0.1 (§16.4) |
| AI-2 | No hook latency measurement | `jejak doctor trace` in v0.1 (§16.2) |
| AI-4 | Concurrent sessions | Warning at SessionStart if another session open (§6.3) |
| AI-9 | Path-unsafe handles | Sanitize dev-handle (§2) |
| Q1–Q4 | Open questions | Answered in §20 (evidence in REVIEW-LLD-v2 Part 4) |

### 1.5 Review v3 resolutions (V3 / C)

| ID | Issue | Resolution |
|---|---|---|
| V3-1 | Trailer ambiguous with concurrent sessions | Multiple `Jejak-Session:` trailers; `jejak link` returns list (§10.5) |
| V3-2 | `jejak attach` commit link undefined | Three-branch behavior + `--force` (§16.4) |
| V3-3 | S3b before S4 chicken-and-egg | Hook no-ops until ledger exists; documented (§19) |
| C-2 | `active-session-id` unlisted | Public CLI command (§16.5) |
| C-3 | `commit_sha` lag on commit-then-close | SessionEnd polls before final meta (§5) |
| C-4 | Staging dir accumulation | SessionEnd cleans staging on success (§9) |

---

## 2. Resolved design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Shadow ref | `refs/heads/jejak/sessions/v1` | Finn-validated; standard git tooling |
| Session path | `sessions/<handle>/<shard:2>/<session-id>/` | Per-writer partition + balanced tree (Δ-3) |
| `session_path()` | `shard = session_id[:2].lower()` | ~256 shards/handle; ~5 entries/shard/year at team scale |
| Tree write | Finn `read-tree` + `update-index` + `write-tree` | §10.1; lift verbatim, change path only |
| Tree merge | Client-side `read-tree -m` | Q1: Entire does client-side at scale; no server infra |
| Commit link | **`Jejak-Session` trailer** (authoritative) + index (accelerator) | Survives rebase/amend/squash (Δ-1) |
| Storage tiers v0.1 | **One-tier + local staging** (Path A) | Δ-2; two-tier deferred v0.2 |
| Staging | `~/.jejak/staging/<session-id>/` local-only | Pre-PII scratchpad; never pushed |
| Push primitive | Plain `git push` + retry loop | Shared ref; not `--force-with-lease` |
| Hook tiers | **Agent hooks** + **git hooks** | Entire model (Δ-1, Δ-2 prep) |
| PII framing | **Best-effort**, not guarantee | Entire security docs; paired with staging + `.jejakignore` |
| dev-handle | Config → git config → email local-part → fail | Sanitized: `[+/\\:@]` → `-`, lowercase, max 64 chars (AI-9) |
| Session ID | Prefer `YYYY-MM-DD-<uuid>` when agent provides | Natural sort (AI-7) |

---

## 3. System context

```mermaid
flowchart TB
    subgraph Agents["Claude Code"]
        CC[session.jsonl]
    end

    subgraph AgentHooks["Agent hooks — less than 50ms"]
        SS[SessionStart]
        ST[Stop]
        SE[SessionEnd]
    end

    subgraph GitHooks["Git hooks"]
        PCM[prepare-commit-msg]
    end

    subgraph Local["Local only — never pushed"]
        STAGE["~/.jejak/staging/session-id/"]
        LEDGER["~/.jejak/brain/repo-hash.db"]
        DISPATCH["~/.jejak/dispatch/"]
    end

    subgraph Worker["snapshot_worker"]
        STRIP[Stripper + PII]
        WRITER[shadow_branch.ts]
    end

    subgraph Git["Git"]
        MAIN[main branch commits + Jejak-Session trailer]
        SHADOW["refs/heads/jejak/sessions/v1"]
    end

    CC --> AgentHooks --> Worker
    Worker --> STAGE
    Worker --> STRIP --> WRITER --> SHADOW
    GitHooks -->|"Jejak-Session trailer"| MAIN
    SHADOW -->|"jejak push"| Origin[origin]
```

---

## 4. Module layout

**Stack:** TypeScript 5 strict on Node 20 LTS+, ESM, pnpm + tsup. See [IMPLEMENTATION-ORDER.md §Tech stack](IMPLEMENTATION-ORDER.md#tech-stack-locked).

| Module / path | Responsibility |
|---|---|
| `src/cli.ts` | commander entry; `bin.jejak` target; dispatches subcommands |
| `src/shadow_branch.ts` | Write (§10), merge (§12), CAS, flock, dedup, `sessionPath()` |
| `src/snapshot_worker.ts` | Pipeline orchestration; single-flight + rerun |
| `src/capture_hook_utils.ts` | Agent hook spawn; hook timing for trace |
| `src/commit_trailers.ts` | `prepare-commit-msg` logic (§10.5) |
| `src/transcript_readers/claude_code_jsonl.ts` | Live tail read, resume |
| `src/stripper.ts` | Raw → stripped v1 |
| `src/pii_scanner.ts` | `applyDispatch()` |
| `src/session_ledger.ts` | SQLite CRUD (better-sqlite3) |
| `src/doctor.ts` | Diagnostics + trace (§16.2) |
| `src/logger.ts` | pino wrapper → `~/.jejak/dispatch/<repo-hash>.log` |
| `src/types.ts` | Shared interfaces (`StrippedEvent`, `SessionMeta`, `HookPayload`) |
| `adapters/claude-code/git-hooks/prepare-commit-msg` | 3-line bash → `exec "{{JEJAK_CLI}}" _hook prepare-commit-msg "$@"` |
| `adapters/claude-code/settings.json.template` | Hook block merged into user's `.claude/settings.json` by `jejak install`; `{{JEJAK_CLI}}` → resolved `jejak` path |

---

## 5. Capture lifecycle

Core flow with these additions:
- **SessionStart:** warn if another session `status=open` (AI-4)
- **Resume:** `captured → open`, keep offset (I-4)
- **Commit:** `prepare-commit-msg` stamps one `Jejak-Session:` trailer per open session (Δ-1, V3-1)
- **SessionEnd (final worker, C-3):** before writing final `meta.json`:
  1. Poll for matching commit: `git log -1 --format=%H --grep="Jejak-Session: $SID"` (or parse HEAD trailers)
  2. Back-fill `meta.commit_sha` if found
  3. Write shadow ref upsert with final status
  4. On success: `rm -rf ~/.jejak/staging/<session-id>/` (C-4). On failure: leave staging for diagnostics

---

## 6. Hook contract & async worker

### 6.1 Fail-open invariants

Same as v0.2, plus:
- Git hooks (`prepare-commit-msg`) MUST exit 0; trailer failure logs to dispatch, never blocks commit
- Hook duration recorded to dispatch log on every invocation (feeds `doctor trace`)

### 6.2 Single-flight: flag-and-rerun

Unchanged from v0.2 (C-4). See prior sequence diagram in git history.

### 6.3 Hook registration (v0.1)

#### Agent hooks (Claude Code `.claude/settings.json`)

| Event | Mode | Timeout | Purpose |
|---|---|---|---|
| `SessionStart` | detached | 30s | Open/resume ledger; concurrent-session warning |
| `Stop` | sync bounded | 3s | Partial snapshot per turn |
| `SessionEnd` | detached | 15s | Final capture |

#### Git hooks (`.git/hooks/` via `jejak install`)

| Hook | Purpose |
|---|---|
| `prepare-commit-msg` | Append `Jejak-Session:` trailer(s) for all open sessions in this repo (V3-1) |

Installed by `jejak init` / `jejak install`. Removed by `jejak uninstall`.

**Hook command shape (locked).** `jejak install --claude-code` resolves the running CLI (`which jejak` or `process.execPath`) and substitutes `{{JEJAK_CLI}}` in `settings.json.template`. Agent hooks use kebab-case `_hook` arguments mapped from Claude Code events:

| Claude Code event | Command |
|---|---|
| `SessionStart` | `{{JEJAK_CLI}} _hook session-start` |
| `Stop` | `{{JEJAK_CLI}} _hook stop` |
| `SessionEnd` | `{{JEJAK_CLI}} _hook session-end` |

Example (SessionEnd):

```json
{ "type": "command", "command": "{{JEJAK_CLI}} _hook session-end", "timeout": 15 }
```

Git hook `prepare-commit-msg` is a 3-line bash script: `exec "{{JEJAK_CLI}}" _hook prepare-commit-msg "$@"`. The `_hook` subcommand is internal (hidden from public `--help`); handlers live in `src/cli.ts` and delegate to lib modules.

**v0.2 git hooks (Path B prep):** `post-commit` (condense temp → permanent), `pre-push` (optional shadow push).

### 6.4 Hook performance trace (AI-2)

Every hook writes to dispatch log:

```json
{"ts":"...","level":"info","hook":"Stop","session_id":"...","message":"hook_complete","extra":{"duration_ms":12}}
```

`jejak doctor trace` aggregates p50/p95/p99 per hook type. Target: agent hooks p95 < 50ms.

---

## 7. Transcript reader

Unchanged from v0.2. Resume handling (I-4) in §5.

---

## 8. Stripper pipeline

Thinking blocks: **verbatim default**, cap 4 KB per block, `--strip-thinking` to redact. Bulk reduction from tool results (R5).

---

## 9. PII dispatcher

**Framing:** redaction is **best-effort**, not a guarantee. Document in README and `jejak doctor`. Defense layers: PII scan + `.jejakignore` + local staging + push hard gate.

### v0.1 catalog (block severity)

| # | Pattern |
|---|---|
| 1 | AWS keys: `AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}` |
| 2 | GCP SA keys: `"private_key": "-----BEGIN PRIVATE KEY-----"` |
| 3 | `Authorization: Bearer [A-Za-z0-9+/_=-]+` |
| 4 | SSH private keys: `-----BEGIN OPENSSH PRIVATE KEY-----` |
| 5 | `(SECRET\|TOKEN\|KEY\|PASSWORD\|API_KEY)\s*=\s*['"]?[A-Za-z0-9+/_-]{16,}['"]?` |
| 6 | JWT-shaped: `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |

**Opt-in (warn/scrub):** email — via `.jejak/pii.yaml`. Org-specific patterns (internal customer ID formats, internal token prefixes) added to `.jejak/pii.yaml` in parallel with dogfood; do not gate launch on full security audit (Q3).

**Staging flow (Path A, Δ-2):**
1. Stripper output → `~/.jejak/staging/<session-id>/events.jsonl` (local, never pushed)
2. PII dispatcher runs on staged content
3. If PII dispatcher uninitialized or `should_block` on unrecoverable content → **block shared-ref write** (hard error)
4. Scrubbed output → shadow ref write
5. **SessionEnd cleanup (C-4):** after successful final shared-ref write, delete `~/.jejak/staging/<session-id>/`. Failed writes leave staging intact for `jejak doctor`.

**Hard gate:** `jejak push` refuses if PII not initialized (§19).

### 9.1 Self-install refusal & per-repo disable

Two related guards keep jejak from capturing itself or any repo that opts out:

**Self-install refusal.** `jejak install` reads `package.json` at the repo root. If `name` matches the jejak package name (the running binary's own package name, resolved at install time), `install` exits non-zero with:

```
jejak: refusing to install hooks in the jejak repo itself.
This would cause jejak to capture its own development sessions and pollute
the shadow ref with self-referential traces. Use a separate test project
(see [IMPLEMENTATION-ORDER.md](IMPLEMENTATION-ORDER.md) §Test project). Override: --i-know-what-im-doing (undocumented).
```

The override exists for jejak's own development edge cases (e.g., manually crafted hook tests) but never appears in `--help`.

**`.jejak/disabled` escape hatch.** Every hook (agent + git) starts with:

```typescript
// First line of every hook handler
if (existsSync(join(repoRoot, '.jejak/disabled'))) process.exit(0)
```

Any repo can opt out without uninstalling. Marker file is a zero-byte file. `jejak doctor` reports its presence. `.gitignore` should typically include `.jejak/` so the marker stays per-developer (committing it would force-disable across the team).

---

## 10. Shadow branch write path

### 10.1 Tree composition (C-1)

Lift Finn's index pattern unchanged. **Only change:** path passed to `update-index`. **Implementation:** TypeScript in `src/shadow_branch.ts`; Finn reference below is Python for readability.

```python
# Finn reference (shadow_branch.py) — logic ports 1:1 to TS
def session_path(dev_handle: str, session_id: str) -> str:
    handle = sanitize_handle(dev_handle)
    shard = session_id[:2].lower()
    return f"sessions/{handle}/{shard}/{session_id}"

def upsert_session_blobs(dev_handle, session_id, events_blob, meta_blob):
    path = session_path(dev_handle, session_id)
    # ... Finn read-tree / update-index / write-tree / CAS ...
```

Reference: Finn `shadow_branch.py` `_write_checkpoint_locked` (lines 407–450).

**Scaling:** hash-sharding (Δ-3) keeps `git ls-tree sessions/<handle>/<shard>/` fast indefinitely. **No archival needed** (§11.1 removed).

### 10.5 Commit trailers (Δ-1, V3-1)

**Problem:** `index/<handle>/by-commit.ndjson` breaks on `rebase`, `amend`, `squash`, `cherry-pick`.

**Solution:** `Jejak-Session` trailer on the commit object — survives history rewrite.

**Concurrent sessions (V3-1):** AI-4 allows multiple `status=open` sessions. A single-session trailer would be non-deterministic. Git trailers support repeated keys — emit **one `Jejak-Session:` trailer per open session**. `jejak link <sha>` returns all matching session IDs. One commit may map to N sessions; one session's `meta.commit_sha` may appear in multiple session metas.

Deferred v0.2: interactive disambiguation picker (Entire-style) if N>1 and user prefers one trailer only.

#### Trailer format

```
fix: webhook retry idempotency

Jejak-Session: 2026-05-30-sess_01HABC
Jejak-Session: 2026-05-30-sess_01HDEF
```

Optional v0.2: `Jejak-Attribution: 73% agent (146/200 lines)` (AI-3, deferred).

#### `prepare-commit-msg` implementation

```bash
#!/usr/bin/env bash
# $1 = commit message file, $2 = commit source
jejak active-session-id --all-open 2>/dev/null | while IFS= read -r SID; do
  [[ -n "$SID" ]] || continue
  git interpret-trailers --in-place \
    --trailer "Jejak-Session: $SID" \
    -- "$1" 2>/dev/null || true
done
exit 0
```

`jejak active-session-id --all-open` prints one session ID per line for all `status=open` sessions in this repo. With no open sessions or no ledger yet, prints nothing and exits 0.

#### `jejak link <sha>` resolution order

Returns **a list** of session IDs (may be empty, one, or many):

1. **Trailer (authoritative):** parse all `Jejak-Session:` values from `git log -1 --format=%B <sha>`
2. **Index fallback:** grep `index/*/by-commit.ndjson` (legacy / pre-trailer)
3. **Meta proximity fallback:** sessions whose `meta.end_sha` matches or neighbors `<sha>`

CLI output: one session ID per line, or JSON with `--json`.

#### meta.json anchor (C-3)

`commit_sha` set when:
- SessionEnd final worker polls git log / HEAD trailers before writing meta (primary v0.1 path)
- `jejak attach` links session to commit (§16.4)

v0.2: dedicated `post-commit` git hook for immediate back-fill.

---

## 11. Storage layout

**Compression (v0.1):** session events stored as `events.jsonl.gz` (gzip via `node:zlib`). Read path gunzips after `git cat-file`. v0.2 may adopt zstd (`.zst`) if dogfood shows size pressure — see IMPLEMENTATION-ORDER.md tech stack.

### Shadow ref tree (Δ-3)

```
refs/heads/jejak/sessions/v1
├── .gitattributes
├── README.md
├── VERSION
├── sessions/
│   └── alice/                    ← dev-handle (Layer 1 partition)
│       ├── 0f/                   ← shard = session_id[:2]
│       │   └── 2026-05-30-sess_01HABC.../
│       │       ├── events.jsonl.gz   ← gzip via node:zlib (v0.1); zstd (.zst) in v0.2 if size matters
│       │       └── meta.json
│       ├── 3a/
│       └── ff/
└── index/
    └── alice/
        └── by-commit.ndjson      ← query accelerator, not authoritative link
```

**At team scale** (~1250 sessions/dev/year): ~5 entries per shard per handle — trivially balanced.

### meta.json schema (v1)

```json
{
  "v": 1,
  "session_id": "2026-05-30-sess_01HABC",
  "agent": "claude-code",
  "dev_handle": "alice",
  "started_at": "2026-05-30T14:00:00Z",
  "ended_at": "2026-05-30T14:45:00Z",
  "status": "captured",
  "commit_sha": "def456",
  "branch": "feat/auth",
  "start_sha": "abc123",
  "end_sha": "def456",
  "working_tree_dirty": false,
  "produced_commits": ["def456"],
  "event_count": 147,
  "blocked_event_ids": [],
  "blocked_count": 0
}
```

**`status`:** `partial` | `captured` | `captured-with-blocks` | `failed`

**`branch`:** gated by `jejak.capture_branch_name` (default true)

**`produced_commits[]` heuristic:** `git reflog --since=<started_at> --until=<ended_at>` filtered by author email. Failure modes: amend, rebase, no commit, outside window.

### 11.1 Archival

**Not needed** with hash-sharded layout (Δ-3). Removed from v0.3 plan. Revisit only if dogfood shows unexpected tree bloat.

---

## 12. Conflict-free merge

§12.1–12.3 unchanged from v0.2. Client-side merge (Q1: confirmed). Server-side merge explicitly rejected for v0.1.

---

## 13. Pre-turn diff (v0.2)

Unchanged.

---

## 14. Ledger & session state

State machine unchanged from v0.2 (`captured → open` on resume).

---

## 15. Push / fetch

Unchanged from v0.2: fetch → merge §12.2 → plain push + retry. PII hard gate before push.

---

## 16. Read path & diagnostics

### 16.1 Read path

```mermaid
flowchart LR
    LINK["jejak link sha"] --> TR["parse all Jejak-Session trailers"]
    TR -->|found| SHOW["jejak show session (each)"]
    TR -->|miss| IDX["index fallback"]
    IDX --> SHOW
    LOG["jejak log"] --> LST["git ls-tree by handle/shard"]
    SHOW --> CAT["cat-file + gzip decompress"]
```

### 16.2 `jejak doctor`

| Check | Condition | Output |
|---|---|---|
| Stale sessions | `status=open`, last event > 1h | list + `jejak attach` hint |
| Dispatch errors | `level=error` in 7d | count + tail |
| Shadow sync | local vs origin ahead/behind | commit count |
| Orphaned locks | lock without worker PID | offer cleanup |
| Agent hook install | `.claude/settings.json` | pass/fail |
| Git hook install | `prepare-commit-msg` present | pass/fail |
| PII ready | patterns loaded | pass/fail (push gate) |
| Filesystem | NFS/iCloud/Dropbox | warn |
| Watcher conflict | hooks + watcher | warn |
| Staging orphans | Failed SessionEnd **or** abandoned session with staging dir remaining | offer discard (C-4; successful sessions auto-clean) |

#### `jejak doctor trace` (AI-2)

Reads dispatch log hook timings. Reports per-hook p50/p95/p99. Flags any agent hook p95 > 50ms.

### 16.3 `jejak uninstall`

Remove agent hooks + git hooks. Optional `--purge` removes `~/.jejak/<repo-hash>/` for this repo (ledger, dispatch log, staging). Shadow ref untouched.

### 16.4 `jejak attach <session-id>` (AI-1, V3-2)

Manually capture a session the hooks missed. Mirrors Entire's `entire attach` semantics.

```bash
jejak attach 2026-05-30-sess_01HABC
jejak attach 2026-05-30-sess_01HABC --force   # skip amend prompt
```

**Pipeline:** read transcript → strip → PII → shadow ref write (always).

**Commit link (three branches):**

1. **HEAD already has `Jejak-Session:` trailer(s)** — append this session ID as an additional trailer on HEAD via `git interpret-trailers` (no amend; repeated keys supported per V3-1). Set `meta.commit_sha = HEAD`.
2. **HEAD has no `Jejak-Session:` trailer** — prompt user to amend HEAD with the new trailer. `--force` skips prompt and amends. User declined → write shadow ref with `meta.commit_sha = null`; session appears as **unlinked** in `jejak log` / `jejak doctor`.
3. **Not a git repo / detached HEAD** — shadow write only; `commit_sha = null`.

Use when: hooks not installed, hook failure, research session worth keeping.

### 16.5 `jejak active-session-id` (C-2)

Public diagnostic — which session(s) jejak considers active for this repo.

```bash
jejak active-session-id              # most recently active open session (stdout, one line)
jejak active-session-id --all-open   # all open sessions, one per line (for prepare-commit-msg)
```

Entire equivalent: `entire session current`. Used by git hooks and humans debugging concurrent-session state.

---

## 17. End-to-end data flow

```
Claude Code → session.jsonl
           → agent hooks → snapshot_worker
           → ~/.jejak/staging/ (local scratchpad)
           → strip + PII (best-effort)
           → shadow_branch upsert → refs/heads/jejak/sessions/v1
git commit → prepare-commit-msg → Jejak-Session trailer on main commit
           → jejak push → origin
           → jejak link <sha> (trailer first) → jejak show
```

---

## 18. Invariants checklist

All v0.2 checks, plus:

- [ ] `prepare-commit-msg` exits 0 always; trailer failure is logged not blocking
- [ ] `jejak link` returns list; tries all trailers before index
- [ ] Concurrent open sessions → multiple `Jejak-Session:` trailers on commit
- [ ] SessionEnd polls `commit_sha` before final meta; cleans staging on success
- [ ] `jejak attach` implements three-branch link semantics; `--force` skips amend prompt
- [ ] Session paths use `sessions/<handle>/<shard:2>/<session-id>/`
- [ ] dev-handle sanitized before use in paths
- [ ] Staged content written locally before PII; shared write blocked if PII uninitialized
- [ ] Hook duration logged for `doctor trace`
- [ ] `jejak attach` works for missed sessions
- [ ] `jejak install` refuses self-install (jejak repo); every hook checks `.jejak/disabled` first (§9.1)

---

## 19. Build order

```mermaid
flowchart TD
    S1["1. JSONL reader + stripper + golden tests"]
    S2["2. shadow_branch.ts — write + sessionPath"]
    S3["3. jejak init — shadow ref + .gitattributes"]
    S3b["3b. Git hooks — prepare-commit-msg + trailers"]
    S4["4. Agent hooks + worker + flag-and-rerun + staging"]
    S6["6. PII dispatcher + catalog"]
    S5["5. jejak push/fetch"]
    S7["7. jejak doctor + trace + attach"]
    S8["8. jejak show / log / link"]
    S9["9. jejak uninstall"]
    S10["10. Dogfood 4 weeks"]

    S1 --> S2 --> S3 --> S3b --> S4
    S4 --> S6 -->|"HARD GATE"| S5
    S2 --> S8
    S4 --> S7
    S5 & S7 & S8 & S9 --> S10
```

**Gates:** S5 after S6 (PII). S3b before S8 (`jejak link` needs trailers).

**S3b note (V3-3):** The `prepare-commit-msg` hook is intentionally inert until S4 ships the ledger — it exits 0 when no open sessions exist. Trailers start landing once agent hooks + ledger are live. Safe to install early.

---

## 20. Open questions & deferred work

### Resolved (REVIEW-LLD-v2 Part 4)

| # | Question | Decision |
|---|---|---|
| Q1 | Merge strategy | **Client-side** indefinitely; no GitHub Action |
| Q2 | PII catalog | **6 patterns + `.jejak/pii.yaml`**; best-effort framing; expand during dogfood |
| Q4 | Tree composition | **Lift Finn** write + merge (~200 LOC); change path only |

### Input needed

| # | Question | Recommendation |
|---|---|---|
| Q3 | **Dogfood cohort roster** | 5–10 engineers; ≥1 shared repo with 3+ concurrent devs; buddy-pair same branch week 1; ≥1 Linux + ≥1 macOS; **4 weeks** minimum |

### Deferred

| Item | Target | Notes |
|---|---|---|
| **Δ-2 Path B** — two-tier storage | v0.2 | Temp ref `jejak/temp/<session>-<worktree>`; condense at `post-commit`; see REVIEW-LLD-v2 §Δ-2 checklist |
| `Jejak-Attribution` trailer | v0.2 | AI-3; needs diff baseline |
| Pre-turn diff | v0.2 | §13 |
| Cursor adapter | v0.2 | |
| PII quarantine dir | v0.2 | M-4 |
| `jejak doctor --report` webhook | v0.2 | M-7 |
| `--checkpoint-remote` | v0.2 | AI-5; separate repo for traces |
| `jejak digest` | v0.3 | |
| `jejak replay` | v1 | Research |
| ATIF format | v1 | Explicitly rejected (REVIEW-LLD-v2 Part 7) |

### Δ-2 Path A acceptance (v0.1)

One-tier shared ref with:
- Local staging before PII
- PII hard gate on push
- Explicit documentation that one PII slip on shared ref = team exposure
- `jejak doctor` surfaces staging orphans for abandoned sessions

Path B (Entire-style two-tier) planned v0.2 once git-hook tier exists.

---

## Review history

| Review | Verdict |
|---|---|
| [REVIEW-LLD.md](REVIEW-LLD.md) | Approve with required changes → incorporated v0.2 |
| [REVIEW-LLD-v2.md](REVIEW-LLD-v2.md) | Ship-ready + 3 Entire deltas → incorporated v0.3 |
| [REVIEW-LLD-v3.md](REVIEW-LLD-v3.md) | Implementation-ready → incorporated v0.4 |

**Remaining input:** dogfood cohort roster (§20 Q3).

---

*End of document.*
