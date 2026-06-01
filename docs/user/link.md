# `jejak link <sha>`

Show which capture session(s) produced a given commit. While a session is open, jejak's
`prepare-commit-msg` hook (installed by [`jejak setup`](setup.md)) stamps a `Jejak-Session:`
trailer onto every commit you make. `link` reads those trailers back.

```console
$ jejak link HEAD
2026-05-31-abcd1234

$ jejak link 9f3c1a2
2026-05-31-abcd1234
2026-05-31-bcde2345
```

A commit can carry more than one trailer if multiple sessions were open when you committed. Feed an
id into [`jejak show`](show.md) to read the session that produced the change.

## Flags

| Flag | Purpose |
|---|---|
| `--json` | Emit `{ "sha": …, "sessions": [ … ] }` |

## See also

- [`jejak show`](show.md) · [`jejak setup`](setup.md) · [How capture works](concepts/capture.md)
