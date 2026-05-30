# Architect Review v2 — DESIGN-LLD.md (post-revision)

**Reviewer role:** Software Architect (adversarial)
**Date:** 2026-05-30
**Methodology:** Re-read the updated DESIGN-LLD.md and ARCHITECTURE.md, then researched Entire CLI (the named reference project), agent-lens, ShadowGit, gitagent, Claude Code observability tools, and git commit trailer patterns. Findings are evidence-backed with sources at the end.

**Verdict:** **Ship-ready on the 9 prior findings** (C-1..C-4, I-1..I-5 are all resolved cleanly). However, research surfaced **3 architectural deltas vs Entire CLI** (the named reference) that you should consciously decide on before locking v0.1.

The deltas aren't blockers. You can ship as designed. But Entire has been in production for ~6 months across thousands of teams (4.3K GitHub stars, $60M seed, ex-GitHub CEO at the helm), and they made different choices on three load-bearing decisions. Worth understanding *why* before committing.

---

## Part 1 — Re-evaluation of prior findings (brief)

All four critical and five important issues from REVIEW-LLD.md are resolved in the v0.2 draft. Specifically:

| ID | Resolution | Evidence in updated doc | Verdict |
|---|---|---|---|
| C-1 Tree composition | §10.1 — Finn `read-tree`/`update-index`/`write-tree` pattern, with concrete pseudocode and Finn line refs | Algorithm explicit, retry loop in place, archival deferred to v0.3 with threshold | ✅ Resolved |
| C-2 Merge algorithm | §12.2 — `read-tree -m` + manual merge commit, with explicit index concat fallback | Algorithm spelled out, includes Finn empty-index bug fix | ✅ Resolved (see Part 3 for a path-layout question that affects this) |
| C-3 .gitattributes placement | §12.3 — committed in shadow ref root + `$GIT_DIR/info/attributes` belt-and-suspenders + explicit concat | Triple-safe; exceeds what I asked for | ✅ Resolved |
| C-4 Coalesce drops events | §6.2 — flag-and-rerun via `.pending` file, with sequence diagram | Pattern clear; A re-runs on completion if B set the flag | ✅ Resolved |
| I-1 `--force-with-lease` | §15 — plain `git push` + 5-attempt retry loop | Correct primitive for shared-write ref | ✅ Resolved |
| I-2 Thinking-block cap | §8 — verbatim default, 4 KB cap, `--strip-thinking` flag | Diagnostic value preserved | ✅ Resolved |
| I-3 PII before push | §19 — hard gate edge in mermaid (`S6 → S5` as "HARD GATE") | Build order enforces it | ✅ Resolved |
| I-4 Session resume | §5 + §14 state machine `captured → open` | Explicit transition shown | ✅ Resolved |
| I-5 `jejak doctor` | §16.2 — 8 specific checks specified | Concrete; can be implemented | ✅ Resolved |

**Net:** the prior review is fully addressed. Implementation can start. The rest of this document is what changes if you also incorporate evidence from Entire CLI.

---

## Part 2 — Research findings (the evidence base)

I read Entire CLI's public source repo, docs, and engineering blog posts directly. Key findings that matter for jejak's design:

### 2.1 Entire's storage model is two-tier — jejak's is one-tier

From the [Entire CLI blog](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) and [Core Concepts docs](https://docs.entire.io/core-concepts):

> "We use a two-tier storage model for temporary and permanent Checkpoints. … The Entire CLI writes those Checkpoints to shadow branches. Shadow branches are temporary, out-of-band branches that store Checkpoint data while you work. They follow a specific naming convention: `entire/<commit-hash-7-chars>-<worktree-hash-6-chars>`, and stay completely separate from your working branch. … Once you commit, that temporary state is condensed into a permanent record."

**Two distinct branches**:
- **Temporary shadow**: `entire/<session-id>-<worktree-id>` — local only, NEVER pushed, may contain unredacted data, for in-session rewind. Cleaned up automatically.
- **Permanent**: `entire/checkpoints/v1` — orphan branch, PII-redacted, pushed alongside code, contains only what's commit-anchored.

**Jejak's current design** writes directly to `refs/heads/jejak/sessions/v1` on every Stop hook. That's one tier — the temp and permanent are collapsed into one push-shared ref. Implications:
- Many shadow-ref commits per session (one per Stop trigger)
- Unredacted-by-mistake events go to the shared push, not just local
- Research-only sessions (no commit) still pollute the shared ref

### 2.2 Entire uses commit trailers — jejak uses a side-channel index file

From [Entire docs](https://docs.entire.io/core-concepts#checkpoint-linking):

> "Entire links checkpoints to your commits using Git commit trailers:
> ```
> feat: Add login form validation
>
> Entire-Checkpoint: a3b2c4d5e6f7
> Entire-Attribution: 73% agent (146/200 lines)
> ```"

And from the engineering blog:

> "Because the Checkpoint ID is stored in a commit trailer and not tied to a commit hash, **it survives commonly used git operations that rewrite commit history, like rebase, amend, squash, and cherry-pick**. Instead of breaking when commits are rewritten, the link between your code and its session history remains intact."

**Jejak's current design** uses `index/<handle>/by-commit.ndjson` to map commits to sessions. This is a side-channel file — it does NOT survive cherry-pick, rebase, or squash. A trailer is atomic with the commit object itself.

### 2.3 Entire's path layout uses hash-sharding — jejak uses month/handle prefixes

From [Entire docs](https://docs.entire.io/core-concepts#folder-structure-on-github):

```
entire/checkpoints/v1 (branch)
├── 0b/                              ← Shard (first 2 chars of checkpoint ID)
├── 0c/
├── 0f/
│   ├── 45ffa1b752/                  ← Checkpoint (remaining chars)
│   ├── 4637ba1146/
│   └── f8ca6db1c9/                  ← Full ID: 0ff8ca6db1c9
│       ├── metadata.json
│       └── 0/                       ← Session folder (numbered)
│           ├── content_hash.txt
│           ├── context.md
│           ├── full.jsonl
│           ├── metadata.json
│           └── prompt.txt
├── 10/
└── ...
```

**256 evenly-distributed shards.** Each `<shard>/` directory stays small (~250-500 entries even at team annual volume). `git ls-tree <shard>` is fast. No archival needed for years.

**Jejak's current design** is `sessions/<YYYY-MM>/<dev-handle>/<session-id>/`. This concentrates writes in the current month (one hot directory) and groups under handle for conflict-free merges. It needs archival at year-end to keep `jejak log` performant.

### 2.4 Entire has both agent hooks AND git hooks — jejak only has agent hooks

From [Agent Hooks blog](https://entire.io/blog/agent-hooks-the-integration-layer-between-entire-cli-and-your-agent):

> "Entire uses two kinds of hooks…
> - **Agent hooks** fire during the agent session at moments like prompt submit, turn end, or subagent execution. These hooks let Entire observe the session as it unfolds.
> - **Git hooks** fire during repository operations like commit and push. These hooks let Entire take that captured session context and link it into Git history by adding an `Entire-Checkpoint` trailer to the user commit, then storing the richer metadata on `entire/checkpoints/v1`."

**Jejak's current design** uses only agent hooks (SessionStart, Stop, SessionEnd). No `prepare-commit-msg`, `post-commit`, or `pre-push` git hooks. This means jejak can't add trailers at commit time, can't anchor to commits cleanly, and can't piggyback on `git push` to also push the shadow ref.

### 2.5 Entire is commit-anchored — jejak is session-anchored

From the [Entire blog](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed):

> "Checkpoints are created when you or the agent make a Git commit. Entire captures all session data during your work, and when you commit, the checkpoint metadata is permanently stored and linked to your commit."

The semantic boundary in Entire is **the commit**. Sessions that don't produce commits stay temporary-local. Multiple sessions producing one commit collapse to one checkpoint with multiple session folders.

**Jejak's current design** captures per-session regardless of commit. This is Finn's model. It's more thorough (you don't lose research sessions) but produces more entries and decouples from the natural git review boundary.

### 2.6 Entire has `session attach` as a first-class fallback

From [docs](https://docs.entire.io/cli/commands#attach):

> "Attach an existing agent session that was not captured automatically by Entire. … Use it when: hooks were not installed when the session started, hooks failed to fire, you want to keep a research-only session that did not produce file changes."

**Jejak's current design** has no equivalent. If the hook fails, data is lost.

### 2.7 Entire instruments hook performance from day one

From the [commands reference](https://docs.entire.io/cli/commands#doctor-trace):

> "`entire doctor trace` — Show hook performance traces for debugging slow Git operations."

**Jejak's current design** says "Hook MUST return <50ms" but provides no way to measure compliance after install.

### 2.8 Other agent-trace projects use different models (for context)

- **[agent-lens](https://github.com/dreadnode/agent-lens)** (dreadnode, MATS research) uses "shadow git" differently — a *bare repo* at `.shadow_git/` per run, invisible to the agent via `GIT_DIR`/`GIT_WORK_TREE` env vars. This is per-run change tracking, not a parallel branch model. Different goal: replay for AI safety research.
- **[ShadowGit](https://docs.shadowgit.com/)** runs as a background process creating `.shadowgit.git`, captures every file save as a commit, exposes via MCP server to the AI. This is time-travel for the AI, not session capture.
- **[gitagent](https://github.com/open-gitagent/gitagent)** writes audit logs to `.gitagent/audit.jsonl` with OpenTelemetry instrumentation. JSON-line-per-event model, no shadow branch.
- **[git-ai](https://github.com/git-ai-project/git-ai)** stores agent sessions *outside* git, optionally syncs to team prompt store. Opposite of jejak's "in-git" principle.

Entire is the only direct architectural parallel to jejak's plan. The others are different problems with different solutions.

---

## Part 3 — Three architectural deltas to consider

These are not C-/I-level findings. The design is correct as-is and can ship. But Entire's production-validated choices differ on three load-bearing decisions. Each gets a recommendation.

### Δ-1. Add commit trailers (the biggest single improvement available)

**The miss:** jejak's `index/<handle>/by-commit.ndjson` does not survive `git rebase`, `git cherry-pick`, `git commit --amend`, or squash merges. Any commit history rewrite breaks the commit-to-session link. Entire chose trailers specifically because they survive these operations.

**Recommendation for v0.1:**

Add a `Jejak-Session: <session-id>` (and optionally `Jejak-Attribution: <pct>% agent`) trailer via a `prepare-commit-msg` git hook. Keep the `by-commit.ndjson` index as a query accelerator — but trailers become the authoritative link.

Implementation cost: ~1 day. The hook reads the active session ID from the ledger, appends a trailer to `$1` (the commit message file) using `git interpret-trailers --in-place --trailer "Jejak-Session: $sid"`.

Updates needed to your design:
- New `prepare-commit-msg` git hook in `adapters/claude-code/` (or repo-level, since it's git-event-driven, not agent-event-driven).
- New section §10.5 documenting trailer format.
- `jejak link <sha>` becomes: `git log -1 --format=%B <sha> | git interpret-trailers --parse` first; fall back to index lookup if no trailer (legacy sessions, or sessions captured without the hook).
- `meta.json` gains a `commit_sha` field as primary anchor.

This unblocks NC-2 (commit-anchored model) without requiring the full two-tier storage rebuild.

### Δ-2. Adopt a two-tier storage model (or consciously reject it)

**The trade-off:** jejak currently writes to the shared push ref on every Stop hook. Entire keeps in-session data on local-only shadow branches and only writes to the shared `entire/checkpoints/v1` ref at commit time.

#### One-line summary

Mid-session writes go to a local-only branch that never gets pushed; only the final, commit-anchored version reaches the shared ref. Think of it like a notebook vs. a published report — one-tier writes every scribble into the published report; two-tier keeps a private scratchpad and publishes only the polished version.

#### Scenario 1: Alice abandons a debugging session (the "near-leak" case)

Alice opens Claude Code to debug a Stripe webhook bug.

- **Turn 1**: agent reads `webhook_handler.py` → `Stop` fires
- **Turn 2**: agent writes experimental retry logic → `Stop` fires
- **Turn 3**: Alice pastes a Stripe API key into the chat to test directly → `Stop` fires
- **Turn 4**: agent suggests a rewrite, Alice realizes the approach is wrong, closes the session

Crucially: **Alice never commits**. She walks away.

**In jejak's current design (one-tier):**
Each of the 4 `Stop` hooks wrote a snapshot to `refs/heads/jejak/sessions/v1` — the same ref that gets pushed. The PII regex caught the API key body but missed the conversational line where Alice typed *"use my key sk_test_..."* On her next `git push`, all 4 snapshots reach origin. The whole team's `jejak fetch` now contains her abandoned exploration, and the near-leak of her API key is in shared history. Cleanup requires `git filter-repo` on the shadow ref plus a coordinated team re-fetch.

**In a two-tier design (Entire-style):**
Each `Stop` wrote to a local-only branch (e.g., `jejak/temp/sess_01HABC-worktree_xyz`). That branch isn't in any push refspec — `git push` never touches it. Because Alice never committed, the condensation step that promotes scratchpad data into the shared `jejak/sessions/v1` ref never ran. The temp branch sits on her laptop until `jejak doctor` notices it's an ENDED session with no commit and offers to discard it. **Nothing reached origin.**

#### Scenario 2: Bob commits a real fix (the "signal dilution" case)

Bob runs an agent session that produces 8 `Stop` snapshots and 1 `SessionEnd`. He commits `fix: webhook retry idempotency` and pushes.

**In one-tier:** the shared ref now has 9 commits from Bob's session (8 partial + 1 final). All 9 get pushed. Teammates fetching see 9 entries for this one logical change. `jejak log` and `jejak link <sha>` show diluted signal.

**In two-tier:** the 9 in-session writes all stayed on Bob's local temp branch. At commit time, the `post-commit` hook condensed them into **one entry** on `jejak/sessions/v1`, keyed by the commit SHA. Teammates see one entry per commit.

#### Scenario 3: PII regex misses something (the "second-chance" case)

An agent reads a config file containing a database connection string. The PII catalog has no pattern for this format (e.g., `mongodb+srv://...` with a password inline).

**In one-tier:** the PII layer doesn't match. The string is in the tool result. It writes to the shared ref. On next push, it's on origin.

**In two-tier:** same first miss, but it lands on the local temp branch. The next commit triggers condensation — which gets a **second PII pass** with stricter patterns (slower regexes acceptable here because they run once per commit, not once per turn). If the second pass also misses, you're in the same state as one-tier. But you got two chances instead of one, and the heavier scan can include patterns too expensive for the hot per-Stop path.

#### What two-tier buys you

1. **PII slips contained, not leaked.** Two redaction passes instead of one — the second can use slower/stricter patterns.
2. **Research and abandoned sessions stay local.** No commit → nothing shared. Eliminates noise.
3. **One shared-ref entry per commit, not per Stop.** Clean signal for `jejak link <sha>` and `jejak log`.
4. **Local data can be unredacted and detailed**; shared data is redacted and condensed. Supports both "personal forensics" and "team review" use cases from the same capture pipeline.

#### What two-tier costs you

1. Two refs to manage instead of one.
2. A `post-commit` git hook to do the condensation step.
3. A cleanup mechanism for orphaned temp branches (`jejak doctor` job).
4. Mid-session rewind reads from the temp branch, not the shared one.
5. ~3–4 extra implementation days vs. one-tier.

#### Two acceptable paths

**Path A — Keep one-tier (current design) with a safety net** — recommended for v0.1
- Add a per-session, local-only staging file at `~/.jejak/staging/<session-id>/events.jsonl` that holds the pre-PII copy.
- PII runs over the staged content before any write to the shared ref.
- If the PII dispatcher fails or is uninitialized, the shared-ref write is **blocked** (hard error), not silently skipped.
- Document explicitly that this design accepts the "one PII slip = pushed leak" risk.
- Captures ~80% of the safety benefit without rebuilding the storage model.

**Path B — Adopt two-tier (Entire-style)** — recommended for v0.2
- Per-session shadow branches: `refs/heads/jejak/temp/<session-id>-<worktree-id>` (push-blocked via refspec config; never in default `git push`).
- At git commit time (`post-commit` hook), condense the temp shadow into a permanent entry on `refs/heads/jejak/sessions/v1` keyed by commit SHA.
- Research-only sessions stay temporary; auto-expire after N days or via `jejak doctor`.
- Becomes feasible once Δ-1 (commit trailers) and the git-hooks tier are wired.

#### Recommendation

**Path A for v0.1 with the staging safety net + commit trailers from Δ-1. Plan Path B for v0.2.** The safety net captures most of the risk reduction without the architectural rework. Path B is a clean follow-up once the git-hooks tier exists (which Δ-1 forces you to build anyway for `prepare-commit-msg`).

#### Picking this up later — v0.2 implementation checklist

When you're ready to do Path B, the work is:

1. Add `jejak/temp/<session-id>-<worktree-id>` ref naming convention to `lib/shadow_branch.py`.
2. Add `.gitconfig` snippet (or `jejak init` step) to exclude `jejak/temp/*` from push refspecs.
3. Move the per-Stop snapshot writes from `refs/heads/jejak/sessions/v1` to the new temp ref.
4. Add a `post-commit` git hook (new file under `adapters/claude-code/git-hooks/`).
5. Implement `condense_temp_to_permanent(session_id, commit_sha)` in `shadow_branch.py` — reads temp ref, applies stricter PII pass, writes one entry to `jejak/sessions/v1`.
6. Implement `jejak doctor`'s temp-branch cleanup: list temp branches with no associated commit, age them out after N days.
7. Move mid-session rewind reads from `jejak/sessions/v1` to the temp ref (`jejak show --session <id> --live`).
8. Migration: existing v0.1 entries on `jejak/sessions/v1` stay where they are; new sessions follow the two-tier flow. No retroactive migration.

Pre-requisites that should already be in place by v0.2 if Δ-1 was adopted:
- `prepare-commit-msg` git hook exists (for trailers).
- Git-hooks adapter directory exists at `adapters/claude-code/git-hooks/`.
- `meta.json` already has `commit_sha` as a field.

Without the trailer work from Δ-1, Path B is much harder because there's no clean way to know "which session(s) produced this commit" at condensation time.

### Δ-3. Path layout — hash-shard within the per-writer prefix

**The trade-off:** Entire's 256-shard layout keeps the tree balanced forever. Jejak's month/handle layout concentrates writes by month (the current month is a "hot directory" all month) and needs archival to stay performant past ~1 year.

**The constraint:** jejak's conflict-free guarantee depends on the per-writer namespace at the root. Pure hash sharding (Entire-style) loses that.

**Recommendation: hybrid layout** —

```
sessions/<dev-handle>/<shard:2>/<session-id>/{events.jsonl.zst, meta.json}
```

This preserves jejak's Layer 1 guarantee (per-writer paths never collide) AND balances the tree within each writer (256 shards per dev keep `git ls-tree alice/` fast). At team annual scale (~5 sess/day × 250 days = ~1250 sessions/dev/year), each shard under each handle averages ~5 entries — trivially balanced.

Index files stay at `index/<dev-handle>/by-commit.ndjson` (no change needed).

Cost: 1-2 lines in `session_path(session_id)` calculation. Do it now; migration cost later is real.

**This eliminates the need for v0.3 archival entirely**, because the tree stays balanced indefinitely.

---

## Part 4 — Answers to the four open questions (evidence-backed)

### Q1: Tree composition — lift Finn verbatim, or simplify?

**Answer: Lift Finn's `_write_checkpoint_locked` and `_write_blob_to_tree` functions.**

Evidence: Entire's CLI is written in Go and uses [go-git](https://github.com/go-git/go-git) library, which exposes the same `ReadTree`/`UpdateIndex`/`WriteTree` primitives. They use the same conceptual algorithm. Finn's Python implementation is essentially the canonical pattern; there's no simpler version that still scales.

The pattern is standard git plumbing for orphan-branch upserts. Anything simpler (e.g., recursive `mktree` from scratch) you'd have to debug under load. Finn already debugged it.

**Strip from Finn**: FinnLogger, decision-integrity hooks, role-contract assertions. Keep the core write + merge functions. ~200 LOC of net imports.

**Caveat from Δ-3**: change the *path layout* you pass into the algorithm; the algorithm itself doesn't care about path structure.

### Q2: Merge strategy long-term — client-side vs server-side (GitHub Action)?

**Answer: Client-side. Don't add server-side infrastructure.**

Evidence: Entire CLI ships with $60M backing and 4.3K stars, and they do client-side merge in their CLI binary. Their `entire enable --checkpoint-remote` flag lets you push checkpoints to a *different repo* — but the merge itself is still client-side. They never built a GitHub Action / server-side merge despite having a hosted product. If it weren't necessary at multi-thousand-team scale, it's not necessary at small-team scale.

The fetch-merge-push retry loop converges because Layer 1 path partitioning guarantees mergeable changes. Two devs pushing simultaneously: one push wins, the other rebases-and-retries automatically. With per-writer namespacing this is always trivial.

**When server-side would be worth it**: if you wanted to centralize checkpoints across many repos (Entire's checkpoint-remote pattern), or wanted CI to enforce a redaction policy server-side. Neither is a v0.1 need.

### Q3: PII catalog scope — ship ~6 or expand from prior leak history first?

**Answer: Ship 6 + extensibility + adopt "best-effort" framing from Entire's docs.**

Evidence: Entire ships their own `redact/` Go package and is explicit in [security docs](https://github.com/entireio/cli/blob/main/docs/security-and-privacy.md):

> "Entire automatically redacts detected secrets (API keys, tokens, credentials) when writing to entire/checkpoints/v1, but **redaction is best-effort**. Temporary shadow branches used during a session may contain unredacted data and should not be pushed."

The "best-effort" framing matters. Don't position jejak's PII layer as a guarantee — it isn't. Position it as a defense layer paired with `.jejakignore` (path exclusion) and the two-tier model (if you adopt Path B in Δ-2).

**Concrete v0.1 catalog** (matches Finn + research):
1. AWS access keys (`AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}`)
2. GCP service account keys (`"private_key": "-----BEGIN PRIVATE KEY-----"`)
3. Generic `Authorization: Bearer …` tokens
4. SSH private key blocks (`-----BEGIN OPENSSH PRIVATE KEY-----`)
5. `(SECRET|TOKEN|KEY|PASSWORD|API_KEY)\s*=\s*['"]?[A-Za-z0-9+/_-]{16,}['"]?`
6. JWT-shaped strings (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`)

Plus `.jejak/pii.yaml` for org-specific additions (your customer ID format, internal API token prefixes, etc.).

Don't gate the launch on a full security audit. Run that in parallel; absorb findings into `.jejak/pii.yaml` as they emerge.

### Q4: Dogfood cohort — size, composition, repos?

**Answer: 5-10 people, ≥2 on the same repo, ≥1 pair on the same branch on the same day.**

Evidence: Entire's [engineering blog](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) explicitly mentions architectural evolution post-launch driven by real-world use:

> "Real-world engineering isn't linear. You rebase mid-session, you stash changes, and you often run multiple agents at once. To handle this, we moved away from simple hooks and formalized how sessions behave."

The features they added post-launch (concurrent session warning, line attribution, subagent tracking, session state machine) are all things that *only emerge from multi-dev, multi-session, real-work usage*. A 2-3 person dogfood would miss them.

**Concrete recommendation**:
- **Size**: 5-10 engineers minimum.
- **Repos**: at least one shared repo where 3+ devs work concurrently. Two repos minimum so you observe the `jejak.config.yaml` resolution behavior across contexts.
- **Pairing**: explicitly buddy two engineers to work on the same branch on the same day in week 1. This forces the merge path to fire.
- **Operating systems**: ≥1 Linux + ≥1 macOS minimum. Skip Windows for v0.1.
- **Metrics to collect during dogfood**:
  1. Stripped session size distribution (target <500 KB; alarm if p95 > 2 MB).
  2. Hook latency p50, p95, p99 (target p95 < 50ms; this requires Δ-1-related instrumentation — adopt now even if you skip the trailer work).
  3. Dedup skip rate (Finn observed ~40%; if you're <20%, dedup logic needs review).
  4. PII block / scrub rates per session (sanity check that the catalog is hitting real things).
  5. Push retry count distribution (>2 retries average means the fetch-merge cycle isn't converging well).
  6. Sessions that produced no commit (these are the candidates for `jejak attach` UX — measure how often this happens).
- **Duration**: 4 weeks minimum, not 2. Week 1 is install + smoke; weeks 2-4 are where unforeseen edge cases emerge.

---

## Part 5 — Additional improvements worth considering (lower priority)

| ID | Item | Source | Effort | Recommendation |
|---|---|---|---|---|
| AI-1 | `jejak attach <session-id>` for failed/missed captures | [Entire docs](https://docs.entire.io/cli/commands#attach) | 1 day | Add to v0.1 — failure mode WILL happen |
| AI-2 | `jejak doctor trace` for hook performance | [Entire docs](https://docs.entire.io/cli/commands#doctor-trace) | 0.5 day | Add to v0.1 — you have a <50ms invariant with no measurement |
| AI-3 | `Jejak-Attribution` trailer (% agent vs human) | [Entire core concepts](https://docs.entire.io/core-concepts#line-attribution) | 2 days | Defer to v0.2 — non-trivial; needs working-tree diff baselines |
| AI-4 | Concurrent-session warning at SessionStart | [Entire blog](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) | 0.5 day | Add to v0.1 |
| AI-5 | `--checkpoint-remote` (push shadow ref to separate repo) | [Entire enable docs](https://docs.entire.io/cli/commands#entire-enable-flags) | 1-2 days | Defer to v0.2 — useful for public repos with private session data |
| AI-6 | `jejak dispatch` (digest of recent agent work, local mode) | [Entire dispatch docs](https://docs.entire.io/cli/commands#dispatch) | 1-2 days | Defer to v0.2/v0.3 — confirms Finn's headless agent pattern works in production |
| AI-7 | Session ID format `YYYY-MM-DD-<UUID>` | [Entire docs](https://github.com/entireio/cli#sessions) | 0 | Adopt; natural sortability is nice |
| AI-8 | Subagent capture as nested sessions, not flat | [Entire concepts](https://docs.entire.io/core-concepts#nested-sessions) | 1 day | Defer to v0.2 (subagent capture is v0.2 anyway) |
| AI-9 | Email local-part sanitization for path safety | LLD §2 dev-handle rule | 30 min | Add to v0.1 — handles `+`, `/`, non-ASCII edge cases |
| AI-10 | `state machine` for sessions: IDLE → ACTIVE → ENDED, persisted to `.git/jejak-sessions/` | [Entire blog](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) | — | Already implicit in your SQLite schema; no change needed |
| AI-11 | `entire labs` pattern for experimental subcommands | Entire CLI | 0 | Adopt when adding experimental features in v0.2+ |

---

## Part 6 — Recommended additions to the LLD before implementation

In priority order:

1. **Adopt Δ-1**: add a `prepare-commit-msg` git hook + `Jejak-Session` trailer. Updates: §6.3 hook table (add git hook tier), §10.5 (new section on trailers), §11 meta.json schema (add `commit_sha`), §16.1 (jejak link uses trailers first), §19 build order (insert before S6 PII).
2. **Adopt Δ-3**: change `session_path()` to `sessions/<handle>/<shard:2>/<session-id>/...`. Updates: §11 storage layout diagram, §10.1 example. Eliminates §11.1 archival need.
3. **Add AI-1 and AI-2 to v0.1 scope**: `jejak attach` and `jejak doctor trace`. Updates: §6 CLI table, §16.2 doctor checks.
4. **Decide on Δ-2 explicitly** in §20 (Open questions). Recommend Path A with safety net for v0.1, Path B planned for v0.2 — document the decision either way.
5. **Add AI-9**: sanitize dev-handle for path safety. Updates: §2 decision row.
6. **Adopt the v0.1 PII catalog from §Q3 above**. Updates: §9.

After these changes, the design is genuinely ready for code.

---

## Part 7 — What I'm explicitly *not* recommending

- **Don't adopt ATIF (Agent Trajectory Interchange Format)** — [agent-lens](https://github.com/dreadnode/agent-lens) uses it as a standardized format, and there's value in standards, but jejak's stripped schema v1 is specific to the capture-and-replay use case. Adopting ATIF would force a broader scope. Revisit in v1.
- **Don't write a custom git library** — go-git (Go) and pygit2 (Python) both exist. Finn uses subprocess `git` calls; that's fine and reduces dependencies. Stay there.
- **Don't add a hosted dashboard for v0.1** — Entire has one. You don't need one. CLI-only is correct.
- **Don't add server-side merge infrastructure** — Q2 covered this.
- **Don't add Cursor adapter to v0.1** — already correctly deferred. Resist the temptation to expand scope based on Entire's multi-agent reach. They have 60 engineers and you don't.

---

## Sources

### Entire CLI
- [Entire CLI GitHub](https://github.com/entireio/cli) — 4.3K stars, MIT, written in Go
- [Entire docs: Quickstart](https://docs.entire.io/quickstart)
- [Entire docs: Core Concepts](https://docs.entire.io/core-concepts) — shard layout, trailers, two-tier storage
- [Entire docs: Commands reference](https://docs.entire.io/cli/commands) — `attach`, `dispatch`, `doctor trace`
- [Entire blog: How It Works & Where It's Headed](https://entire.io/blog/the-entire-cli-how-it-works-and-where-its-headed) — architectural principles, post-launch evolution
- [Entire blog: Agent Hooks Integration Layer](https://entire.io/blog/agent-hooks-the-integration-layer-between-entire-cli-and-your-agent) — two-hook-kinds model

### Adjacent projects (for context, not direct borrowing)
- [agent-lens (dreadnode)](https://github.com/dreadnode/agent-lens) — research-oriented; uses bare-repo shadow git per run, ATIF format
- [ShadowGit](https://docs.shadowgit.com/) — time-travel for AI via MCP; different goal
- [gitagent](https://github.com/open-gitagent/gitagent) — JSONL audit log + OpenTelemetry; no shadow branch
- [git-ai](https://github.com/git-ai-project/git-ai) — sessions stored outside git
- [claude-code-hooks-multi-agent-observability (disler)](https://github.com/disler/claude-code-hooks-multi-agent-observability) — live dashboard, not git persistence
- [agents-observe (simple10)](https://github.com/simple10/agents-observe) — live observability plugin
- [agent-flow (patoles)](https://github.com/patoles/agent-flow) — live visualization with SSE

### Git plumbing references
- [git-read-tree](https://git-scm.com/docs/git-read-tree)
- [git interpret-trailers](https://git-scm.com/docs/git-interpret-trailers)
- [Git Trailers article (Alchemists)](https://alchemists.io/articles/git_trailers)

### Finn (prior internal reference, still applicable)
- `scripts/proto-finn/lib/shadow_branch.py` — `_write_checkpoint_locked`, `merge_remote_shadow_branch`
- `scripts/proto-finn/lib/capture_hook_utils.py` — detached worker spawn pattern

---

*End of review v2.*
