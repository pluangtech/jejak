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

## Install (sketch)

```bash
# Step 0 — install the CLI (Node 20+ required)
npm install -g jejak
# Dev: pnpm build && pnpm link --global  (from jejak clone)

# Step 1 — add jejak to your repo
cd my-repo
jejak init

# Step 2 — configure Claude Code + git hooks
jejak setup --claude-code
```

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
- **v0.3** — Codex support, team digest (`jejak digest --since 1w`), prompt-pattern analytics.
- **v1.0** — Pluggable agent adapters, stable trace schema, hosted viewer (optional).

## License

MIT — see [LICENSE](LICENSE).

## Testing

Development uses a separate test repo at `~/Documents/projects/jejak-testproj/` (never run `jejak setup` in the jejak repo itself). CLI spec: [docs/CLI-SPEC.md](docs/CLI-SPEC.md) · execution plan: [docs/IMPLEMENTATION-ORDER.md](docs/IMPLEMENTATION-ORDER.md).

## Docs

Design, architecture, reviews, and the living implementation plan live under **[docs/](docs/)** — start with [docs/README.md](docs/README.md).

