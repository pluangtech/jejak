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

This configures the agent hooks that capture sessions automatically. (Ships in a later release;
see [`commands.md`](commands.md) for current status.)

## Where to go next

- [`init.md`](init.md) — the `jejak init` command in detail
- [`concepts/shadow-branch.md`](concepts/shadow-branch.md) — what jejak stores, and where
- [`commands.md`](commands.md) — auto-generated reference for every command
