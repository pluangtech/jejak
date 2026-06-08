# Jejak

> Capture the trail your AI coding agents leave behind — and keep it in git, next to the code it produced.

`jejak` (Indonesian for "trace" or "footprint") records the session logs from Claude Code, Cursor, and Codex — prompts, decisions, tool calls, agent reasoning — strips them down to what's worth keeping, and commits them to a shadow branch in your repo. No noise in your main history. No merge conflicts when teammates push their own traces.

## Why

When an engineer writes code by hand, the diff plus the commit message is the whole story. When an agent writes it, the diff is the tip of the iceberg. The prompt that started the session, the reasoning the model worked through, the files it read, the tools it called, the dead ends it backed out of — all of that lives in a session log on one laptop, and disappears the moment the developer closes their terminal.

That's a problem when:
- A teammate inherits the code and wants to know *why* it looks the way it does
- A change breaks something and you want to replay the session that introduced it
- You're trying to figure out which prompts and patterns work, and which waste tokens
- Compliance, audit, or postmortem requires reconstructing what an agent did and on whose instruction

`jejak` keeps that context with the code, in the same repo, forever.

## What it does

1. **Captures** session logs from supported agents (Claude Code first; Cursor and Codex next).
2. **Strips** them down: keeps prompts, decisions, tool call signatures, errors, and summaries. Drops huge file blobs, redundant context, and reproducible noise.
3. **Commits** the stripped trace to a shadow branch (`refs/heads/jejak/sessions/v1`) that lives in the repo but stays out of your normal branch history and PRs.
4. **Merges cleanly** by design: each session gets its own hash-sharded path under a per-developer namespace, so traces never collide even when ten engineers push concurrently.

## Install

jejak is not published to npm yet (`0.1.0-dev`), so today you install it from a clone of this
repo. Two repos are involved: **this clone** (the tool's source) and **your project** (where you
want capture).

### Step 0 — build & link the CLI (in this clone)

Requires **Node 20+** and **pnpm**.

```bash
cd jejak
pnpm install            # installs deps + builds the better-sqlite3 native binding
pnpm build              # tsup → dist/cli.js
pnpm link --global      # puts `jejak` on your PATH
```

`jejak --help` should now work from any directory.

### Step 1 — add jejak to your project

```bash
cd my-repo              # must be a git repo (run `git init` first if needed)
jejak init --global     # detect agent, create the shadow branch, write .jejak/config.json
jejak setup --claude-code   # install the Claude Code + git hooks
```

Traces now capture automatically when a session ends. Verify with `jejak doctor`.

> **Non-interactive `init`.** `jejak init` prompts for the agent when it can't detect one, so a
> bare run needs a terminal — in a script or CI it exits with `pass --agent claude-code`. Add the
> flag to skip the prompt: `jejak init --global --agent claude-code`.

> **Why `--global`?** `jejak init` defaults Node repos to *project* mode, where hooks call
> `npx jejak` and teammates get the CLI via `npm install`. That path needs jejak on a registry,
> so until it's published, use `--global` (every developer runs Step 0 once). Non-Node repos
> default to global already. Once published, `npm install -g jejak` replaces Step 0 and project
> mode becomes the team default.

> **Not inside this repo.** `init` / `setup` are refused in jejak's own repo by design — it never
> captures its own development. Use a separate project (or the test repo noted under
> [Testing](#testing)).

Details: [docs/CLI-SPEC.md](docs/CLI-SPEC.md) · progress: [docs/IMPLEMENTATION-ORDER.md](docs/IMPLEMENTATION-ORDER.md)

## Use

After install, your traces capture automatically when a session ends. No daily workflow change.

```bash
jejak status                  # local vs origin trace state
jejak active-session-id       # which session(s) are open
jejak push                    # push jejak/sessions/v1 to origin
jejak fetch                   # fetch + merge teammates' traces from origin
jejak log                     # browse captured sessions
jejak show <session>          # render a session timeline
jejak link <sha>              # list sessions linked to this commit (via trailers)
jejak attach <session>        # manually capture a missed session
jejak doctor [--trace]        # diagnostics + hook latency
jejak uninstall [--purge]     # remove hooks; optional ~/.jejak/<repo-hash>/ purge
```

## Opting out per repo

To disable jejak in a specific repo without uninstalling globally, drop an empty marker file:

```bash
touch .jejak/disabled
```

Every hook (agent + git) checks for this file first and exits silently if present. Remove the file to re-enable. `.jejak/disabled` is typically gitignored so it stays a per-developer setting; commit it to enforce repo-wide.

Note: jejak's own development repo refuses `init` / `setup` (see `jejak setup --help`).

## Roadmap

- **v0.1** — Claude Code capture, commit trailers, stripped JSONL, shadow branch, basic CLI.
- **v0.2** — Cursor support, two-tier storage, pre-turn diff, `Jejak-Attribution` trailer.
  - **Next up:** commit-time reconcile (self-healing capture) — move heavy capture off the per-turn hot path onto a `post-commit` reconcile that re-derives the shadow ref from durable transcripts. Proposal: [docs/plans/COMMIT-TIME-RECONCILE-PROPOSAL.md](docs/plans/COMMIT-TIME-RECONCILE-PROPOSAL.md).
- **v0.3** — Codex support, team digest (`jejak digest --since 1w`), prompt-pattern analytics.
- **v1.0** — Pluggable agent adapters, stable trace schema, hosted viewer (optional).

## License

MIT — see [LICENSE](LICENSE).

## Testing

Because `init` / `setup` are refused inside this repo (see [Install](#install)), exercise the CLI
against a separate project. Development uses a throwaway repo at
`~/Documents/projects/jejak-testproj/`: build and link per [Step 0](#step-0--build--link-the-cli-in-this-clone),
then run `jejak init --global` / `jejak setup --claude-code` there. CLI spec:
[docs/CLI-SPEC.md](docs/CLI-SPEC.md) · execution plan: [docs/IMPLEMENTATION-ORDER.md](docs/IMPLEMENTATION-ORDER.md).

## Docs

Design, architecture, reviews, and the living implementation plan live under **[docs/](docs/)** — start with [docs/README.md](docs/README.md).

