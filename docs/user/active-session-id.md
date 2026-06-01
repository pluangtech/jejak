# `jejak active-session-id`

Print the id of the session jejak currently considers **open** for this repo — the one capture is
actively appending to. Useful for scripting and for sanity-checking that capture is live.

```console
$ jejak active-session-id
2026-05-31-abcd1234
```

Prints nothing (and exits 0) when no session is open, or when the repo has no jejak ledger yet.

## Flags

| Flag | Purpose |
|---|---|
| `--all-open` | Print every open session id, one per line (not just the most recent) |

If a session is stuck open after Claude Code exited, [`jejak doctor`](doctor.md) flags it and
[`jejak attach`](attach.md) finalizes it.

## See also

- [`jejak log`](log.md) · [`jejak doctor`](doctor.md) · [How capture works](concepts/capture.md)
