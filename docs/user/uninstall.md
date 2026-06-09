# `jejak uninstall [--purge]`

Remove jejak's hooks from this repo — the inverse of [`jejak setup`](setup.md). Your captured
traces on the [shadow branch](concepts/shadow-branch.md) are **left untouched**, so re-running
`jejak setup` restores capture cleanly.

```console
$ jejak uninstall
jejak: uninstalling
  agent hooks: removed from .claude/settings.json (foreign hooks preserved)
  git hook:    removed prepare-commit-msg
  push guard:  removed pre-push
  shadow ref: preserved (re-run `jejak setup` to restore hooks)
```

What it does:
- Removes only **jejak's** entries from `.claude/settings.json` (any hooks you added yourself stay).
- Deletes the `prepare-commit-msg` git hook and the `pre-push` [push guard](concepts/shadow-branch.md#kept-off-accidental-pushes)
  **only if they're jejak's** — a foreign hook is left alone.
- The shadow ref and your captured sessions are never deleted by a plain uninstall.

## `--purge`

Also deletes this repo's local jejak state under `~/.jejak/<repo-hash>/` (the session ledger,
staging scratch, and dispatch log). You're asked to confirm first. The shadow ref still survives —
only per-developer local bookkeeping is removed.

## See also

- [`jejak setup`](setup.md) · [`jejak doctor`](doctor.md) · [The shadow branch](concepts/shadow-branch.md)
