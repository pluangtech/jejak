# `jejak doctor`

Diagnose this repo's jejak health — setup, sync, and capture.

```console
$ jejak doctor
jejak doctor — setup checks:
  [ok] agent hooks in .claude/settings.json
  [ok] git hook .git/hooks/prepare-commit-msg
  [ok] session ledger present
  [ok] PII catalog ready (push gate)
  [info] .jejak/disabled: absent
  [info] shadow sync: 2 ahead, 0 behind origin
  [warn] stale session 2026-05-31-abcd1234 — run `jejak attach 2026-05-31-abcd1234`
```

It reports:
- **Setup checks** — agent hooks, git hook, ledger, and the PII catalog (the `push` gate).
- **Shadow sync** — local vs `origin` ahead/behind (or "not pushed yet").
- **Stale sessions** — sessions still `open` with no recent transcript activity (>1h) → an `attach` hint.
- **Orphan locks / staging** — leftovers from a crashed capture, safe to discard.
- **Filesystem warnings** — repos under iCloud/Dropbox/Google Drive/NFS, where sync services can
  corrupt git state.

## `--trace`

Reads the dispatch log and reports per-hook latency percentiles, flagging any agent hook whose p95
exceeds the 50 ms budget (hooks must stay fast so they never slow Claude Code down).

```console
$ jejak doctor --trace
  [trace] dispatch errors (7d): 0
  [trace] session-start: p50 8ms · p95 12ms · p99 14ms · n=42
  [trace] stop: p50 31ms · p95 47ms · p99 88ms · n=42
```

## See also

- [`jejak status`](status.md) · [`jejak attach`](attach.md) · [`jejak setup`](setup.md)
