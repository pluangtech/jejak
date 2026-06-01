# `jejak status`

Report the state of this repo's [shadow branch](concepts/shadow-branch.md): whether it has been
initialized, how many sessions it holds, and how it compares to `origin`.

```console
$ jejak status
shadow ref: refs/heads/jejak/sessions/v1
sessions captured: 7
not pushed yet — no origin tracking ref (run `jejak push`, item 6c)
```

Once sharing is set up, the last line becomes an ahead/behind count against the origin copy of the
ref (e.g. `vs origin: 2 ahead, 0 behind`). If the ref doesn't exist yet, `status` tells you to run
[`jejak init`](init.md).

## Flags

| Flag | Purpose |
|---|---|
| `--json` | Emit `{ initialized, sessions, pushed, ahead, behind }` |

## See also

- [`jejak log`](log.md) · [`jejak init`](init.md) · [The shadow branch](concepts/shadow-branch.md)
