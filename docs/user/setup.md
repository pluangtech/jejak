# `jejak setup`

Configure capture hooks for this repo's agent — **Step 2** of getting started, after
[`jejak init`](init.md). "Setup" configures hooks; it is **not** `npm install`.

```console
$ jejak setup --claude-code
```

## What it does

- **Agent hooks** — adds jejak's `SessionStart` / `Stop` / `SessionEnd` hooks to
  `.claude/settings.json`. The merge is **additive**: any hooks you already have are kept, and
  re-running changes nothing (idempotent).
- **Git hook** — installs `prepare-commit-msg`, which stamps a `Jejak-Session:`
  trailer onto each commit you make while a session is open (so a commit can be traced back to
  the work that produced it). If you already have a `prepare-commit-msg` hook, jejak leaves it
  untouched and tells you to wire it in manually.
- **Push guard** — installs a `pre-push` hook that stops a plain `git push` from publishing the
  [shadow branch](concepts/shadow-branch.md) by accident (including `git push --all` and
  `--mirror`). Traces should only leave your machine through [`jejak push`](push.md), which
  enforces the [privacy gate](concepts/sharing.md#the-privacy-gate). A foreign `pre-push` hook is
  left untouched. See [Keeping the shadow branch off accidental pushes](concepts/shadow-branch.md#kept-off-accidental-pushes).

Both git hooks honor `core.hooksPath`, so they install correctly under husky-style setups.

It does **not** create the [shadow branch](concepts/shadow-branch.md) — that's `jejak init`'s job.

## Project vs global

`setup` reads the `mode` recorded by `jejak init`:

| Mode | Hook command | Sharing |
|---|---|---|
| **project** | `npx jejak …` (portable) | commit `.claude/settings.json` — teammates get hooks via `npm install`, no per-dev setup |
| **global** | the resolved absolute path | each developer runs `jejak setup` once; re-run `--force` after `npm update -g jejak` |

## Flags

| Flag | Purpose |
|---|---|
| `--claude-code` | Configure Claude Code (required in v0.1) |
| `--force` | Re-write the hook scripts (e.g. after upgrading a global install) |

Running bare `jejak setup` (no agent flag) exits non-zero with a hint — v0.1 supports only
Claude Code.

## Turning capture off

Create an empty `.jejak/disabled` file at the repo root; every hook then no-ops. Delete it to
re-enable. (Keep `.jejak/` out of version control so this stays per-developer.) Check status
with `jejak doctor`.

## See also

- [`jejak init`](init.md) · [The shadow branch](concepts/shadow-branch.md) · [user guide](README.md)
