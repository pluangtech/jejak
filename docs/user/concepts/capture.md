---
concept: capture
sources_hash: sha256:b93a0db5ca451f2fdbb0fde8929586802b36c9873d549778d912859ae1010714
---

# How capture works

Once you've run [`jejak setup`](../setup.md), jejak captures your Claude Code sessions
**automatically** — you never run a capture command.

## When it fires

jejak installs three Claude Code hooks:

- **SessionStart** — records the session as open (so commits can be linked to it).
- **Stop** (after each turn) — takes a quick incremental snapshot of the transcript so far.
- **SessionEnd** — a final snapshot, then links the session to any commit you made during it.

Hooks are **fail-open and fast**: they return in well under a second (the heavy work runs in a
detached background worker), and if anything goes wrong they exit cleanly — capturing a session
never blocks Claude Code or your commit.

## What gets stored, and where

Each snapshot strips the raw transcript into a compact narrative and writes it to the
[shadow branch](shadow-branch.md) at `sessions/<your-handle>/<shard>/<session-id>/`:

- `events.jsonl.gz` — the reasoning + actions (thinking kept in full; bulky tool output offloaded);
- `meta.json` — session metadata (status, event count, linked commit).

Capturing **never touches your working tree** — no staged files, no commits on your branch. Until
you push (a later release), traces stay entirely on your machine.

## Secrets are redacted

Before anything is written, a best-effort scanner redacts common secrets (AWS keys, private keys,
`Bearer` tokens, `KEY=…`/`TOKEN=…` assignments, JWTs) to `[REDACTED-<type>]`. The session is still
kept — minus the secret — and flagged `captured-with-blocks` (visible in `jejak doctor`). Add your
own patterns or opt into email redaction with a `.jejak/pii.json` file. It's best-effort, not a
guarantee — treat it as defense-in-depth alongside `.jejakignore` and the push gate.

## Inspecting and pausing

- `jejak active-session-id` — the session(s) jejak currently considers open.
- `jejak doctor` — confirms hooks, the ledger, and capture health.
- Create an empty `.jejak/disabled` file to pause capture for a repo; delete it to resume.

## See also

- [The shadow branch](shadow-branch.md) · [`jejak setup`](../setup.md) · [user guide](../README.md)
