# jejak — user guide

`jejak` captures the trail your AI coding agents leave behind — the prompts, decisions, and
edits from a Claude Code session — and stores them in your git repo without touching your
working tree or history.

This guide is for **people using jejak**. (Design and behaviour contracts live in
[`../DESIGN-LLD.md`](../DESIGN-LLD.md) and [`../CLI-SPEC.md`](../CLI-SPEC.md).)

## Getting started (5 minutes)

### Step 0 — Install the CLI

`jejak` is a command you run in your terminal. Install it once, globally:

```console
$ npm install -g jejak
```

> **Working on jejak itself?** Use a local build instead: `pnpm build && pnpm link --global`.

Verify it's on your PATH:

<!-- run -->
```console
$ jejak --version
```

### Step 1 — Add jejak to your repo

From inside a git repository:

```console
$ cd my-repo
$ jejak init
```

`init` detects which agent your repo uses (e.g. Claude Code), records the choice in a committed
`.jejak/config.json`, and creates the **shadow branch** where traces are stored. It never edits
your files or commits. See [`concepts/shadow-branch.md`](concepts/shadow-branch.md) for what that
branch is and why it exists. Full flag reference: [`init.md`](init.md).

### Step 2 — Wire up capture

```console
$ jejak setup --claude-code
```

This installs the agent hooks that capture every Claude Code session automatically — you don't run
anything per session. Secrets are [redacted before they're stored](concepts/capture.md), and
commits you make while a session is open are stamped with a `Jejak-Session` trailer so they can be
traced back later. Details: [`setup.md`](setup.md).

## The daily workflow

Once you're set up, capture is automatic. The rest is reading and sharing what was captured:

| You want to… | Command |
|---|---|
| List your captured sessions (turns, tokens, **cost**, model) | [`jejak log`](log.md) |
| Inspect one session's prompts, turns, and tool calls | [`jejak show <id>`](show.md) |
| See which session produced a commit | [`jejak link <sha>`](link.md) |
| Check local vs origin state of the trace branch | [`jejak status`](status.md) |
| Share your traces with the team | [`jejak push`](push.md) |
| Pull in teammates' traces | [`jejak fetch`](fetch.md) |
| Recover a session the hooks missed | [`jejak attach <id>`](attach.md) |
| See which sessions are currently open | [`jejak active-session-id`](active-session-id.md) |
| Diagnose setup / sync / capture health | [`jejak doctor`](doctor.md) |
| Remove jejak's hooks (traces kept) | [`jejak uninstall`](uninstall.md) |

To pause capture temporarily, create an empty `.jejak/disabled` file at the repo root (delete it to
resume) — see [`setup.md`](setup.md).

## Concepts

- [The shadow branch](concepts/shadow-branch.md) — what jejak stores, and where (an orphan ref,
  never checked out)
- [How capture works](concepts/capture.md) — the hook lifecycle and secret redaction
- [Sharing traces](concepts/sharing.md) — the conflict-free merge and the PII push gate

## Reference

- [`commands.md`](commands.md) — auto-generated reference for every command and flag
