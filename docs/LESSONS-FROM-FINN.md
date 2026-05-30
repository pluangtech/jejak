# Lessons from Finn — a reference for Jejak implementation

Finn (`~/Documents/projects/finn`) is a harness engineering platform that has *already shipped* a Claude Code capture pipeline. Its 5A feature (`session-capture-ledger`) and the shadow-branch substrate solve most of the problems jejak is going to hit. This doc extracts the patterns worth copying, the gotchas worth dodging, and the file paths to read when implementing each layer of jejak.

> **Not a copy-paste source.** Finn is Python; jejak implements the same patterns in **TypeScript** ([IMPLEMENTATION-ORDER.md](IMPLEMENTATION-ORDER.md) tech stack). Borrow the structural moves; don't drag in the surface area. Jejak should ship in <10 files; Finn's capture layer is ~40.

---

## 1. Hook contract — what Claude Code actually gives you

### 1.1 The settings.json shape

Finn registers nine hook events. Source: `/Users/aditya/Documents/projects/finn/.claude/settings.json`. Jejak should mirror this skeleton but only wire the events it needs (start small: `SessionEnd` + `Stop` for v0.1; add `UserPromptSubmit` and `PostToolUse` in v0.2 once the trace shape is stable).

```jsonc
{
  "hooks": {
    "SessionStart":      [{ "matcher": "startup", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.../hook.sh\"", "timeout": 30, "statusMessage": "Jejak: initializing..." }] }],
    "SessionEnd":        [{ "matcher": "",        "hooks": [{ "type": "command", "command": "...", "timeout": 15, "statusMessage": "Jejak: capturing trace..." }] }],
    "Stop":              [{ "hooks": [{ "type": "command", "command": "...", "timeout": 10 }] }],
    "UserPromptSubmit":  [{ "matcher": "", "hooks": [{ "type": "command", "command": "...", "timeout": 10 }] }],
    "PreCompact":        [{ "matcher": "", "hooks": [{ "type": "command", "command": "...", "timeout": 30 }] }],
    "SubagentStop":      [{ "matcher": "", "hooks": [{ "type": "command", "command": "...", "timeout": 10 }] }]
    // PreToolUse, PostToolUse, Notification, PostCompact also available
  }
}
```

Key facts:

- `$CLAUDE_PROJECT_DIR` is set automatically. Use it as the anchor for all hook script paths.
- `matcher: "startup"` vs `matcher: "resume"` lets you distinguish a fresh session from a continuation. Important — see §6.
- `statusMessage` shows in the Claude Code UI while the hook runs. Use it; users notice silent hangs.
- `timeout` is in seconds. The hook *will* be killed at the timeout. Plan for it.

### 1.2 What each hook gives you (input on stdin, JSON)

| Event | Key fields | Use it for |
|---|---|---|
| `SessionStart` | `session_id`, `transcript_path`, `source` (`"startup"`/`"resume"`) | Mark "session opened" in ledger; check for stale sessions; emit `additionalContext` (see §10). |
| `UserPromptSubmit` | `session_id`, `transcript_path`, `prompt` | Capture pre-turn diff (§7); count turns. |
| `PreToolUse` / `PostToolUse` | `session_id`, `tool_name`, `tool_input`, `tool_output` | Direct stream (vs. JSONL replay) — expensive, only if you need real-time. |
| `Stop` | `session_id` | Mid-session snapshot (bounded wait). |
| `SessionEnd` | `session_id` | Final capture, the canonical "session is done" signal. |
| `PreCompact` | `session_id` | Capture state right before Claude Code compresses context — last clean snapshot before info is lost. |
| `SubagentStop` | `session_id`, `parent_session_id` | Subagent finished; trigger its own capture sub-flow. |

---

## 2. The fail-open principle (do not block the user)

Finn enshrines this as Decision Record 0013. **Every hook script must exit 0 even when it fails internally.** A crashed hook should never block the agent.

Pattern, copied from `scripts/proto-finn/hooks/session-end.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail              # internal strict-mode
# ... work ...
python3 "$LIB_DIR/shadow_branch.py" write-transcript "$SESSION_ID" 2>/dev/null || true
exit 0                          # ALWAYS exit 0 to the hook caller
```

Anything that could fail is wrapped with `|| true` and stderr is redirected. Internal logging goes to `$FINN_LOG_FILE`, never to the agent's stdout/stderr.

**For jejak**: keep a per-repo dispatch log at `.jejak/dispatch.log.jsonl` (or `~/.jejak/dispatch.log` if you don't want it in-repo). Every hook failure writes one line there. Users discover problems via `jejak doctor`, never via a broken session.

---

## 3. The async worker pattern (50 ms hook budget)

Hooks fire on every prompt and every tool call. If your hook takes 500 ms, users feel it. Finn's discipline: hooks return in <50 ms, real work runs detached.

The canonical pattern is in `scripts/proto-finn/lib/capture_hook_utils.py`:

```python
def spawn_snapshot_detached(session_id, source, transcript_path, trigger):
    """Equivalent to `nohup setsid worker.py ... </dev/null >/dev/null 2>&1 & disown`."""
    try:
        proc = subprocess.Popen(
            [sys.executable, str(worker_path), "--session", session_id, ...],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,     # == setsid; detaches from terminal session
            close_fds=True,
        )
        return proc.pid
    except Exception:
        return None                     # fail-open boundary
```

Bash equivalent (used in some hooks):

```bash
nohup setsid python3 "$WORKER" --session "$SID" --transcript "$TP" --trigger "$TRIGGER" \
    </dev/null >/dev/null 2>&1 &
disown || true
```

**Three things easy to miss**:

- `start_new_session=True` (Python) or `setsid` (bash) is what makes the child survive after the parent (the hook) exits. Without it, hook timeout kills the worker too.
- `close_fds=True` prevents the child inheriting open file descriptors that would keep the parent alive on some shells.
- `stdin=DEVNULL` is required. If you forget it, the worker inherits the hook's stdin, and Claude Code's hook pipe stays open, and the hook never returns.

### 3.1 Special case: the `Stop` hook needs a bounded synchronous wait

`Stop` is the last chance to capture before the agent finishes a turn. Finn uses a foreground bounded-wait variant:

```bash
timeout "${STOP_TIMEOUT:-3}" python3 worker.py --trigger stop || \
    finn_log_warn "stop hook timed out after ${STOP_TIMEOUT}s"
exit 0
```

3 seconds is enough for a final snapshot, short enough that users tolerate it.

---

## 4. Reading Claude Code's JSONL transcripts

Source: `~/.claude/projects/<cwd-encoded>/<session-id>.jsonl`. Each line is one event.

### 4.1 Live-file hazards

The file is being *written to* while you read it. Three things will bite you:

1. **Trailing incomplete line.** Read to last `\n`; drop anything after.
2. **`json.loads` fails on the "last complete line"** — Claude Code occasionally flushes mid-record. Back off one more line, retry. Up to 3 lines of slack.
3. **`st_mtime > now - 60s` means "live"** — that session is the *current* one; mark it `in_progress` and read up to last newline only. Don't try to finalize.

Finn's check from `design.md §9.2`:

```python
if st_mtime > now - 60 and transcript_path matches current_session_marker:
    mark_in_progress()
    read_to_last_complete_newline()
    log('LiveTranscriptPartialRead')
```

### 4.2 Offset-based tail reads (don't load the whole file)

Track byte offset in a ledger. `seek(offset)` then read line-by-line with `io.BufferedReader`. **Two separate counters**:

- `last_processed_event_offset` — byte offset. Unit varies per source (bytes for JSONL, rowid for SQLite, etc.).
- `last_processed_event_count` — monotonic event count. Unit-neutral. Drives the "every N turns" trigger.

Advance both atomically in the same ledger commit.

### 4.3 Critical invariant — advance offset even on failure

If a snapshot is blocked (PII, redaction, error), **still advance the offset**. Otherwise the next hook re-extracts the same events and re-fails forever. Finn calls this out explicitly in `requirements.md §4.6`.

---

## 5. The shadow branch — git plumbing

Finn uses `refs/heads/finn/sessions/v1` (an orphan branch). Jejak's plan is `refs/jejak/*`. Both work; trade-offs:

| Approach | Pro | Con |
|---|---|---|
| `refs/heads/<ns>/<name>` (Finn) | Standard tools see it (`git log`, `git fetch` by default) | Shows up in `git branch -a` lists |
| `refs/jejak/*` (jejak v0 plan) | Invisible to default tooling | `git fetch` won't pull it without explicit refspec; `git push` needs `--force-with-lease` care; some hosting providers (especially GitLab CE) need config to even allow non-`heads`/non-`tags` refs |
| `refs/notes/jejak` | Made for this; merge driver built in | Per-commit semantics (notes are attached to a commit); doesn't fit "session is bigger than one commit" |

**Recommendation for jejak v0**: do what Finn does. Use `refs/heads/jejak/sessions/v1`. You get standard git tooling for free. Hide it from `git branch` output via shell alias or `.gitconfig` if it bothers people. Revisit `refs/jejak/*` only if invisibility turns out to actually matter.

### 5.1 Git plumbing recipe

From `scripts/proto-finn/lib/shadow_branch.py` (the substrate):

```python
def _git(*args, env_override=None, stdin_data=None, stdin_bytes=None):
    """Run git, capture stdout. Use stdin_bytes for binary (hash-object)."""
    ...

# Write a blob without touching working tree:
blob_sha = _git("hash-object", "-w", "--stdin", stdin_bytes=gzipped_jsonl)

# Compose a tree from blobs:
tree_input = f"100644 blob {blob_sha}\tsession.jsonl.gz\n100644 blob {meta_sha}\tmeta.json\n"
tree_sha = _git("mktree", stdin_data=tree_input)

# Commit it parented on the current shadow ref head:
parent = _git("rev-parse", "--verify", SHADOW_REF)  # or "" if first commit
parents = ["-p", parent] if parent else []
commit_sha = _git("commit-tree", tree_sha, *parents, "-m", f"session {sid}", stdin_data="")

# CAS update — fails if ref moved (someone else committed):
_git("update-ref", SHADOW_REF, commit_sha, parent or "")
```

### 5.2 The CAS retry loop

Two writers racing → one's `update-ref` fails. Retry with exponential backoff. Finn's config:

```python
_MAX_CAS_RETRIES = 5
_CAS_BASE_BACKOFF_MS = 10
# Attempts at 10ms, 20ms, 40ms, 80ms, 160ms
```

CAS failures *under* the flock indicate something bypassed the lock (rogue writer, NFS, shared mount). Rare but real.

### 5.3 The flock — serialize on one machine

```python
# Path: <git-common-dir>/jejak-shadow.lock
# Use --git-common-dir (not --git-dir) so worktrees share the lock.
common_dir = _git("rev-parse", "--git-common-dir")
lock_path = Path(common_dir) / "jejak-shadow.lock"

with open(lock_path, "w") as lock_fd:
    fcntl.flock(lock_fd, fcntl.LOCK_EX)   # blocking
    # ... do write ...
```

Without this, two simultaneous sessions on the same machine race even under the CAS retry. Flock prevents the wasted retries.

### 5.4 Tree-hash dedup — massive storage win

This is the trick that takes Finn's storage from "huge" to "manageable":

Before acquiring the flock, compute the *candidate tree-hash* (what the new tree would be if you wrote it). Read the prior commit's tree-hash. **If they match, skip the write entirely** — same content, no commit needed. Just emit a `DedupSkip` event.

Why it matters: agent sessions produce a lot of near-identical state (re-snapshots, no-op runs, idle pings). Dedup kills most of them. Finn observed >40% skip rate in normal use.

The full design is in `.finn/specs/shadow-branch-observability-uplift/design.md §3.1, §1.3 Flow A`.

---

## 6. Conflict-free merges — Finn's path layout

Finn's shadow tree layout (close to what jejak's ARCHITECTURE.md proposed):

```
sessions/
  <YYYY-MM>/
    <session-id>/
      events.jsonl.gz       # stripped trace
      meta.json             # session metadata
```

There's **no per-writer namespace** in Finn's layout — Finn assumes a single user per repo. For jejak, **stick with the per-writer prefix** described in ARCHITECTURE.md §4 Layer 1. Finn-style layout would break the conflict-free guarantee the moment two teammates push.

Concrete jejak path:
```
sessions/<YYYY-MM>/<dev-handle>/<session-id>/{events.jsonl.zst, meta.json}
```

Layer 2 union-merge driver and Layer 3 fetch-rebase-push wrapper from ARCHITECTURE.md still apply unchanged.

---

## 7. The pre-turn diff trick (`UserPromptSubmit` hook)

One of Finn's smartest moves. Source: `scripts/proto-finn/hooks/shadow_pre_turn_diff_hook.py` and `.finn/specs/shadow-branch-observability-uplift/design.md §1.3 Flow B`.

**Problem**: when the agent edits a file, you see the *output* of the edit but not what the file looked like *before* the prompt. The `git diff` you'd want is gone by the time `PostToolUse` fires.

**Solution**: at `UserPromptSubmit`, capture `git diff` (working tree vs HEAD) and buffer it. When the next `write_checkpoint` fires, attach the buffered diff to the metadata. Now every captured turn has a "what changed since last prompt" record.

```python
# In UserPromptSubmit hook (fail-open):
diff_text = subprocess.run(["git", "diff", "--no-color"],
                           capture_output=True, timeout=10).stdout
diff_text = redact_pii(diff_text)
buffer_write(session_id, prompt_id, diff_text)   # to .jejak/state/pending-pre-turn-diff.json

# Later, in capture worker:
def augment(metadata, session_id, prompt_id):
    diff = buffer_consume(session_id)
    if diff: metadata["pre_turn_diff"] = diff
```

**Things to copy**:

- **10 MB cap** on diff before redaction. Truncate-and-flag if exceeded.
- **Crash recovery**: buffer is rebuildable from the event log (`session_events WHERE event_type='UserPromptSubmit' AND processed=0`).
- **Staleness**: drop buffered diffs older than 1 hour. Emit `PendingDiffExpired`.
- **Atomic-rename writes**: `mkstemp` + `rename`, with flock on a sibling `.lock` file.

---

## 8. PII / secret scrubbing as a substrate

Finn's `lib/pii_scanner.py` ships a single dispatcher with three outcomes:

```python
def apply_dispatch(content, sink_fn, context=None) -> DispatchResult:
    result = scan(content, context=context)
    if result.should_block:
        return DispatchResult(outcome='blocked', ...)   # sink_fn NOT called
    if non_allowlisted_matches:
        sink_fn(result.scrubbed, notes=patterns)
        return DispatchResult(outcome='scrubbed', ...)
    sink_fn(result.scrubbed, notes=[])
    return DispatchResult(outcome='clean')
```

Why one dispatcher: adding a new pattern (e.g., a new API key format) propagates to every sink site automatically. No "we updated PII rules but forgot to update the drafts path" bugs.

**For jejak**:
- Lift the dispatcher pattern verbatim. Even if v0.1 only has two sink sites (the JSONL stripper and the pre-turn-diff buffer), the architecture pays for itself the moment a third site appears.
- Patterns live in a YAML file with `severity ∈ {block, warn}` + an allowlist. `block` means "do not write this anywhere." `warn` means "redact and record."
- For v0.1, ship 6–10 patterns: AWS keys, GCP keys, generic `Authorization: Bearer …`, private SSH keys, `.env`-style assignments matching `(SECRET|TOKEN|KEY|PASSWORD)=…`, and email addresses. Add more on demand.

---

## 9. Drafts out-of-repo, finalized in-repo

Finn separates two storage tiers:

- **Drafts** at `~/.finn/drafts/<repo-hash>/<session-id>.md` — out-of-repo, accumulating snapshots as the session runs.
- **Finalized** at `<repo>/sessions/<YYYY-MM-DD>-<slug>.md` — in-repo, only written on `finn-capture finalize`.

Why split: drafts are WIP and noisy. You don't want every five-minute snapshot in `git log`. Finalized output is a clean, prose-summarized "what happened" doc — that's what belongs in the repo history.

**For jejak**:

- v0.1: skip the draft tier; write directly to the shadow branch on `SessionEnd`. Simpler.
- v0.2+: add drafts if users ask for "what was I working on this morning?" before a session ends. The `~/.jejak/drafts/<repo-hash>/...` pattern translates directly.

Repo-hash:
```python
repo_hash = hashlib.sha256(repo_root.resolve().as_posix().encode()).hexdigest()[:16]
```

Same hash as the brain.db keying — keeps multi-repo isolation.

---

## 10. The interactivity workaround — `additionalContext`

Hooks have no TTY. They can't prompt the user mid-session. But `SessionStart` hooks can return JSON with `hookSpecificOutput.additionalContext`, which Claude Code injects into the agent's first turn. The agent reads it and naturally surfaces the content to the user.

Finn uses this for "you have pending unfinalized sessions" prompts. From `design.md §8.1`:

```
==== Jejak: 2 pending session(s) ====
[1] 5f3a2b1c  last-event 2d 4h ago  events=147
    options:
      jejak finalize 5f3a2b1c
      jejak skip     5f3a2b1c --reason "<one line>"
[2] ae719...  last-event 18h ago    events=8
BEFORE proceeding with the user's request, you MUST ask the user which
action they want and run the matching command.
==== end jejak ====
```

The "MUST ask the user" + concrete command names + no free-form handoff is what makes this reliable.

**For jejak**: probably not needed in v0.1 (no async-finalize, no pending state). Worth knowing for v0.2 when you might want a "trace from yesterday wasn't pushed — push now?" prompt.

---

## 11. Ledger schema lessons (SQLite)

Finn keeps a per-repo SQLite ledger (`~/.finn/brain/<repo-hash>.db`). Whether jejak needs SQLite at all is a real question — for v0.1 you might get away with a JSON file per session and no aggregated state. But if you do go SQLite:

- **Never `ALTER TABLE DROP COLUMN`.** Introduces a SQLite version floor (≥3.35) and tangles rollback. Use additive table changes only; new fields → JSON in a `metadata TEXT` column.
- **Versioned migrations.** `m001`, `m002`, … numbered linear. Each declares `from_version` / `to_version`. Apply in order.
- **`BEGIN IMMEDIATE` + retry for every write.** Different retry schedules for interactive (short: 25/50/100 ms × 3) vs batch (long: 50/100/200/400/800 ms × 5). Interactive writers must not starve batch.
- **Timestamp comparisons are a footgun.** SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (no offset); ISO-8601-with-`+00:00` strings don't compare correctly as strings against it. Use `julianday(col) < julianday('now', '-N hours')` on **both sides** of the comparison.

For jejak v0.1, recommended schema (~3 tables):

```sql
CREATE TABLE sessions (
  session_id     TEXT PRIMARY KEY,
  agent          TEXT NOT NULL,             -- 'claude-code' | 'cursor' | ...
  started_at     TEXT NOT NULL,             -- ISO-8601 UTC
  ended_at       TEXT,
  transcript_path TEXT NOT NULL,
  last_offset    INTEGER NOT NULL DEFAULT 0,
  last_event_count INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL CHECK (status IN ('open','captured','failed')),
  metadata       TEXT                       -- JSON for ad-hoc fields
);

CREATE TABLE pre_turn_diffs (
  session_id  TEXT NOT NULL,
  prompt_id   TEXT NOT NULL,
  diff_text   TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  consumed_at TEXT,
  PRIMARY KEY (session_id, prompt_id)
);

CREATE TABLE dispatch_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,
  level     TEXT NOT NULL,                  -- 'info' | 'warn' | 'error'
  hook      TEXT,
  session_id TEXT,
  message   TEXT NOT NULL,
  extra     TEXT                            -- JSON
);
```

Keep it minimal. Finn's brain.db has 15+ tables for governance concerns jejak doesn't have.

---

## 12. Headless agent invocation (if you add summarization later)

If jejak adds a "summarize this session" feature (Finn's `finalize` step), the headless-CLI invocation pattern is in `lib/agent_invoker.py`:

```python
PROFILES = {
  'claude-code': AgentProfile('claude-code', 'claude', '-p',
      ['--bare', '--output-format', 'json'], cold_start_budget_sec=15),
  'cursor':      AgentProfile('cursor',      'cursor-agent', '-p',
      ['--force', '--output-format', 'json'], cold_start_budget_sec=20),
  'codex':       AgentProfile('codex',       'codex', '',
      ['exec', '--full-auto', '--output-format', 'json'], cold_start_budget_sec=10),
}
```

Three things Finn learned the hard way:

- **`--bare` (Claude Code) / `--force` (Cursor) skip interactive prompts.** Without these the headless invocation hangs on confirmation dialogs.
- **`--output-format json`**, not `stream-json`. macOS subprocess buffering for streamed JSON is flaky.
- **Classify errors from stderr substrings**: `rate_limit_error|429` → rate-limit, `ECONNREFUSED|ETIMEDOUT|dns` → network, exit `137|143|SIGKILL` → host-crash, JSON parse fail → invalid-response.

Defer this to v0.3+ for jejak. v0.1 should just capture raw events, no summarization.

---

## 13. Adapter pattern — making Cursor easy to add

Finn's module layout (paraphrased from `.finn/specs/session-capture-ledger/design.md §2`):

```
lib/                                  # host-neutral
  session_ledger.py                   # CRUD on the ledger
  transcript_readers/
    base.py                           # Reader protocol (scan/tail/extract)
    claude_code_jsonl.py
    cursor_hooks.py
    cursor_vscdb.py                   # Cursor's SQLite local DB
adapters/                             # host-specific
  claude-code/hooks.json              # template settings.json
  cursor/hooks.json                   # ~20 Cursor hook events
  cursor/hooks/*.sh                   # one shim per Cursor event
```

The **only host-specific surface** is `adapters/<host>/` plus per-host profile entries in `lib/agent_invoker.py` and `lib/transcript_readers/`. Adding a new host = one shim tree + two profile entries. Resist the temptation to special-case hosts inside `lib/`.

**For jejak**: even though v0.1 is Claude Code only, lay out the directories this way from day one. Adding Cursor in v0.2 will be a much smaller PR.

### 13.1 Cursor specifics (heads-up for v0.2)

From `.finn/reference/cursor-integration.md` + Finn's design docs:

- Cursor has ~20 hook events vs. Claude Code's 9 — preToolUse, postToolUse, beforeShellExecution, afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit, etc.
- Cursor's hook config lives at repo-root `.cursor/hooks.json`, not `.claude/settings.json`. Different schema (`version: 1`, no `matcher`).
- Cursor data also lives in a **vscdb SQLite database** (~/Library/Application Support/Cursor/User/...). Schema version drifts (`_v=3` currently). Fail loud on schema mismatch with an env override (`CURSOR_FORCE_SCHEMA=v3`) — never silently force.
- Cursor sessions can get **huge** (Finn observed vscdb files up to 25 GB in active dev). Stream rows with keyset pagination (`WHERE rowid > ? ORDER BY rowid LIMIT N`), never `SELECT * LIMIT/OFFSET` (drifts under concurrent writes).

---

## 14. Things Finn got wrong — don't repeat

### 14.1 Too much governance scaffolding

Finn's `session-capture-ledger` shipped ~4,800 LOC and 29 tasks. A lot of that is governance (decision-integrity backlog, drift-check, PM/architect/reviewer role enforcement) jejak doesn't need. **Don't import Finn's process discipline; just borrow its technical patterns.**

The Finn ship-report at `.finn/specs/session-capture-ledger/ship-report.md` itself documents the failure mode: a spec shipped without emitting a ship-report and the governance loop "self-closed retroactively" — i.e., they added a retroactive audit because they didn't have the discipline to do it in-flight. Don't build a system that requires this kind of remediation.

### 14.2 Stale tests after substrate changes

`F-04` in the ship-report: a sibling spec changed `set -euo pipefail` to `set -u` in shim scripts for fail-open compliance but forgot to update two assertions in `test_cursor_adapter.py`. The test suite went red and nobody noticed for weeks because nobody ran the full suite on `main`.

**For jejak**: have CI run the full test suite on every PR. Don't narrow tests when they go red — fix the root cause.

### 14.3 Two CRDT-shaped problems jejak avoids

Finn assumed single-writer-per-repo for its shadow layout, which is fine for solo dev but breaks at team scale. Jejak's per-writer prefix in the shadow tree (`sessions/<month>/<dev-handle>/...`) is the right fix — adopt it from the start, don't backfill it.

Finn also had to add the `compact_many_checksum_compare` helper to detect "is this a real ledger change or just a re-scan?" Storing `updated_at` was insufficient because scans bumped it without changing content. **For jejak**: when you have to decide "did anything actually change?", checksum the touched fields, not the timestamps.

### 14.4 The `ALTER TABLE DROP COLUMN` trap

Finn's m002 migration explicitly avoids `ALTER TABLE DROP COLUMN` (introduces SQLite version floor; tangles rollback). The fix was to use additive table changes only and stash new fields in a `metadata TEXT` JSON column.

---

## 15. Files to read when implementing each piece

When you sit down to write jejak code, the corresponding Finn source is worth reading first:

| Building | Read this in Finn |
|---|---|
| Hook config & wiring | `.claude/settings.json` |
| Hook script skeleton | `scripts/proto-finn/hooks/session-end.sh`, `user-prompt-submit.sh`, `stop.sh` |
| Async worker spawner | `scripts/proto-finn/lib/capture_hook_utils.py` |
| Snapshot worker | `scripts/proto-finn/workers/snapshot_worker.py` |
| JSONL reader | `scripts/proto-finn/lib/transcript_readers/claude_code_jsonl.py` |
| Shadow branch git plumbing | `scripts/proto-finn/lib/shadow_branch.py` (substrate — read top 200 lines) |
| Tree-hash dedup design | `.finn/specs/shadow-branch-observability-uplift/design.md` §1.3, §3.1, §6 |
| Pre-turn diff hook | `scripts/proto-finn/hooks/shadow_pre_turn_diff_hook.py` |
| PII dispatcher | `scripts/proto-finn/lib/pii_scanner.py` (`apply_dispatch` + `classify_result`) |
| SQLite ledger schema | `scripts/proto-finn/migrations/brain/m002_session_capture_ledger.py` |
| Agent invocation profiles | `scripts/proto-finn/lib/agent_invoker.py` |
| Cursor adapter shape | `.finn/specs/session-capture-ledger/design.md` §10, `.finn/reference/cursor-integration.md` |
| CLI argparse pattern | `scripts/proto-finn/bin/finn-capture` (good model for `bin/jejak`) |

---

## 16. Recommended build order for jejak (informed by what Finn did)

This refines the order in ARCHITECTURE.md §8 based on Finn's experience of which steps were cheap and which were painful:

1. **JSONL reader + stripper with golden-file tests.** Cheap, isolated. Get this right and the rest of the pipeline composes around it.
2. **Shadow ref git plumbing** — `_git` wrapper, blob/tree/commit composition, CAS+flock. Test against a scratch repo. Don't wire to hooks yet.
3. **`jejak init`** — creates the shadow ref, writes `.gitattributes`, `.jejakignore`, and a template `.claude/settings.json` block to merge into the user's config.
4. **The hook script** — single bash hook that spawns a detached Python worker. Worker calls (1) + (2). Test the hook with `claude --debug` first.
5. **`jejak push` / `jejak fetch`** with the Layer 3 fetch-rebase-push wrapper.
6. **PII dispatcher** — pull in patterns; wire to the stripper (sink site 1).
7. **`.jejakignore`** parser; gitignore-style.
8. **Pre-turn diff hook** (`UserPromptSubmit`) — adds sink site 2 for the PII dispatcher.
9. **`jejak show`** / `jejak log` / `jejak link <sha>` — read path. Build last; read path is forgiving.
10. **Dogfood for 2–4 weeks** in a real repo. Measure stripped session sizes, hook latency p95, dedup skip rate. Fix what hurts.
11. **Cursor adapter** (v0.2) — under `adapters/cursor/`.

Defer to v0.3+: summarization via headless agent, drafts tier, `additionalContext` UX, team digest.

---

## 17. Open questions for jejak that Finn doesn't answer

- **Multi-repo workflow.** Most devs work across many repos. Does `jejak push` need to know about origin remotes per-repo, or is there a `jejak push --all` that walks a registered list? Finn is single-repo only.
- **Trace search across repos.** "Find all sessions where someone edited `auth.ts`" — does this need a central index, or grep across cloned repos? Finn doesn't do cross-repo search.
- **Replay.** Finn captures but doesn't replay. Jejak's `jejak show <session>` is a render; should it also support `jejak replay <session>` (re-run the same prompts against a clean checkout to verify reproducibility)? Worth a separate research note before committing.
