# `jejak init`

Add jejak to the current git repository: detect the coding agent, record the choice, and create
the [shadow branch](concepts/shadow-branch.md) that holds captured traces.

`init` is **safe to re-run** — it never edits your tracked files, never makes a normal commit, and
leaves your working tree clean. Running it again on an already-initialised repo is a no-op.

## Usage

```console
$ jejak init
```

That interactive run detects your agent, resolves your developer handle, picks an install mode,
and writes `.jejak/config.json` (which you commit).

## What it does

1. **Detects the agent** your repo uses (e.g. Claude Code). If none or several are found, it asks.
2. **Resolves your handle** — the name your traces are filed under — from `git config jejak.handle`,
   then `user.name`, then your `user.email` local-part.
3. **Picks a mode** — *project* (jejak added as a devDependency, committed for the whole team) or
   *global* (you rely on a global install). Node repos default to project; others to global.
4. **Creates the shadow branch** `refs/heads/jejak/sessions/v1` — an orphan ref, so nothing in your
   working tree or normal history changes. See [shadow-branch.md](concepts/shadow-branch.md).
5. **Writes `.jejak/config.json`** `{ v, agent, mode }` for you to commit.

## Options

| Flag | Effect |
|---|---|
| `--agent <id>` | Skip detection; use this agent (e.g. `claude-code`). Useful in scripts. |
| `--project` | Force project mode (add jejak as a devDependency). Node repos only. |
| `--global` | Force global mode (use a globally installed jejak). Works in any repo. |

## After init

Wire up automatic capture with [`jejak setup`](commands.md):

```console
$ jejak setup --claude-code
```

## Troubleshooting

- **"not a git repository"** — run `git init` first; jejak stores traces as git refs.
- **Run inside the jejak repo itself** — refused by design; jejak never captures its own
  development. Use a separate test repo.
- **Re-running changed nothing** — expected: `init` is idempotent.
