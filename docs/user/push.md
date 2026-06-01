# `jejak push`

Share your captured traces by pushing the [shadow branch](concepts/shadow-branch.md) to `origin`.

```console
$ jejak push
pushed shadow ref to origin
```

If someone else pushed since your last sync, the push is rejected; jejak automatically fetches their
traces, [merges](concepts/sharing.md) them into yours, and retries — so a push never clobbers a
teammate's sessions. If you haven't captured anything yet, it reports `nothing to push`.

## Privacy gate

`push` **refuses to run** (non-zero exit) if your `.jejak/pii.json` fails to load — jejak won't risk
publishing a trace whose custom redaction rules aren't in effect. The built-in secret patterns
always apply; this gate only triggers on a broken custom config. Fix or remove the file and retry.
See [How capture works](concepts/capture.md) for what gets redacted.

## See also

- [`jejak fetch`](fetch.md) · [`jejak status`](status.md) · [Sharing traces](concepts/sharing.md)
