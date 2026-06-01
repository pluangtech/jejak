# `jejak show <session-id>`

Print a captured session's event stream — the prompts, assistant turns, thinking, and tool calls
that were recorded. You don't need to know which handle owns the session; `show` finds it by id.

```console
$ jejak show 2026-05-31-abcd1234
session 2026-05-31-abcd1234  ·  captured  ·  42 events  ·  12 turns  ·  $0.8512

#0  2026-05-31 09:30:01  user/user
    refactor the auth module
#1  2026-05-31 09:30:14  assistant/assistant  claude-opus-4-8
    [thinking] The module has three call sites…
    [tool_use:Read] {"path":"src/auth.ts"}
    [tool_result] first 200 chars… <a1b2c3d4e5f6… 8000 bytes>
```

Large content (long tool results, big files) is **offloaded** to content-addressed blobs and shown
as a preview plus a `<sha… N bytes>` reference. Pass `--expand` to resolve those references and
print the full content inline.

## Flags

| Flag | Purpose |
|---|---|
| `--expand` | Resolve offloaded payloads to their full content |
| `--json` | Emit the raw stripped events as JSON |

## Privacy

Secrets are redacted **before** anything is stored, so `show` never prints them — a session that
had secrets removed is marked `captured-with-blocks` and lists the redaction counts in its header.
See [How capture works](concepts/capture.md).

## See also

- [`jejak log`](log.md) · [`jejak link`](link.md) · [The shadow branch](concepts/shadow-branch.md)
