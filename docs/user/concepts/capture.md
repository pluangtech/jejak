---
concept: capture
sources_hash: sha256:1a16e8d025914f2821c889a146ef09eeb23a7cbee79981fb6b2cd2794708b11c
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

## Inspecting and pausing

- `jejak active-session-id` — the session(s) jejak currently considers open.
- `jejak doctor` — confirms hooks, the ledger, and capture health.
- Create an empty `.jejak/disabled` file to pause capture for a repo; delete it to resume.

## See also

- [The shadow branch](shadow-branch.md) · [`jejak setup`](../setup.md) · [user guide](../README.md)
