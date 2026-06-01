# `jejak log`

List the sessions captured on the [shadow branch](concepts/shadow-branch.md), with the analytics
recorded for each — turns, token usage, cost, and the model(s) used.

```console
$ jejak log
SESSION              STATUS                STARTED           TURNS  IN     OUT    CACHE   COST      MODEL
2026-05-31-abcd1234  captured              2026-05-31 09:30  12     4210   8800   120400  $0.8512   claude-opus-4-8
2026-05-30-ef567890  captured-with-blocks  2026-05-30 14:02  3      900    1500   12000   $0.1203   claude-opus-4-8
```

By default `log` shows **your** sessions (resolved from your git/jejak handle). Pass `--all` to
list every developer's sessions on the ref. `CACHE` is the sum of cache-write and cache-read
tokens; `COST` is re-derivable from the raw token counts, so it updates if pricing changes.

## Flags

| Flag | Purpose |
|---|---|
| `--all` | List sessions from every dev handle, not just yours |
| `--json` | Emit the raw session metadata as JSON (for scripts / analytics) |

## See also

- [`jejak show`](show.md) — inspect one session · [`jejak status`](status.md) ·
  [The shadow branch](concepts/shadow-branch.md) · [How capture works](concepts/capture.md)
