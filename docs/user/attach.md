# `jejak attach <session-id>`

Recover a session the hooks left unfinished — for example when Claude Code exited before jejak's
final capture ran. `attach` captures the session onto the [shadow branch](concepts/shadow-branch.md)
and links it to your current commit.

```console
$ jejak attach 2026-05-31-abcd1234
captured 2026-05-31-abcd1234 onto the shadow ref
  link: amended HEAD with Jejak-Session: 2026-05-31-abcd1234
```

`jejak doctor` lists stale open sessions and suggests the exact `attach` command to run.

## How it links to a commit

- **HEAD already has a `Jejak-Session` trailer** → the new one is appended (no prompt).
- **HEAD has no jejak trailer** → you're asked before amending HEAD to add one (`--force` skips the
  prompt). Declining captures the session but leaves it **unlinked**.
- **No branch HEAD** (unborn or detached) → captured but unlinked (`commit_sha` stays null).

The session id must already exist in your local ledger (the hooks saw it start). Fully manual,
never-seen captures aren't in scope for v0.1.

## Flags

| Flag | Purpose |
|---|---|
| `--force` | Amend HEAD without the confirmation prompt |

## See also

- [`jejak link`](link.md) · [`jejak doctor`](doctor.md) · [How capture works](concepts/capture.md)
