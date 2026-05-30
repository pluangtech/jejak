# Architect Review v3 — DESIGN-LLD.md v0.3-draft

**Reviewer role:** Software Architect
**Date:** 2026-05-30
**Scope:** Re-read after v0.3-draft changes that incorporated v2 findings (Δ-1, Δ-2 Path A, Δ-3, AI-1/2/4/7/9, Q1/Q2/Q4 resolutions).
**Verdict:** **Implementation-ready.** Three small issues came in with the new changes and four cleanups are worth doing before code. None block starting the build.

---

## Part 1 — What v0.3 resolved (brief)

Every v2 item landed cleanly:

| Δ / AI | Resolution in v0.3 |
|---|---|
| Δ-1 commit trailers | §10.5 — `Jejak-Session` trailer via `prepare-commit-msg`; `jejak link` resolution order trailer → index → meta proximity; `commit_sha` added to meta.json schema |
| Δ-2 Path A staging | §9 — staging at `~/.jejak/staging/<session-id>/`; PII runs before shared-ref write; hard gate if PII uninitialized; doctor surfaces orphans (§16.2) |
| Δ-2 Path B v0.2 | §20 — properly deferred with cross-reference to REVIEW-LLD-v2 §Δ-2 checklist |
| Δ-3 hash-shard | §10.1 `session_path()`; §11 layout `sessions/<handle>/<shard:2>/<session-id>/`; §11.1 archival explicitly removed |
| AI-1 attach | §16.4 — `jejak attach <session-id>` for missed captures |
| AI-2 doctor trace | §6.4 hook timing logged + §16.2 trace subcommand with p50/p95/p99 |
| AI-4 concurrent warning | §5 — warn at SessionStart if another session open |
| AI-7 session ID format | §2 — prefer `YYYY-MM-DD-<uuid>` |
| AI-9 handle sanitization | §2 — `[+/\\:@]` → `-`, lowercase, max 64 chars |
| Q1 merge strategy | Resolved: client-side indefinitely |
| Q2 PII catalog | Resolved: 6 patterns + `.jejak/pii.yaml`, best-effort framing |
| Q4 tree composition | Resolved: lift Finn write + merge functions |

Build-order gates are explicit (S6 → S5 PII hard gate; S3b → S8 trailers before `jejak link`). ARCHITECTURE.md is now in sync with the LLD.

---

## Part 2 — Issues introduced by the new changes

These all stem from the v0.3 additions. None existed in v0.2.

### V3-1. Trailer ambiguity under concurrent sessions

**Where:** §10.5 (prepare-commit-msg) + §5/AI-4 (concurrent session warning)

**The problem:** AI-4 says SessionStart warns when another session is already `status=open` — i.e., concurrent sessions are an accepted state. §10.5's `prepare-commit-msg` calls `SID=$(jejak active-session-id)`, which is undefined when multiple sessions match `status=open` for this repo. The trailer becomes non-deterministic in the exact scenario AI-4 just promised to handle.

**Why it matters:** A team member who opens Claude Code in two terminals (one for exploration, one for the actual fix) commits the fix. The trailer might point to the exploration session. `jejak link <sha>` returns the wrong session. The whole "commit-anchored truth" of Δ-1 quietly breaks.

**Options:**
- **(a) Most-recent-activity tie-breaker** — pick the session with the largest `last_event_count` or most recent `updated_at`. Simple, often right (the active terminal is where you just typed), occasionally wrong.
- **(b) Per-worktree filter** — only consider sessions whose `transcript_path` originated in the current worktree (via `--git-common-dir` resolution). Closer to per-terminal but requires worktree tracking in the ledger.
- **(c) Interactive prompt** — `git commit` triggers an interactive picker if N>1 (Entire's approach). Cleanest semantics; worst UX (interrupts every commit during concurrent work).
- **(d) Multiple trailers** — emit one `Jejak-Session:` trailer per open session, let `jejak link <sha>` return all of them. Most accurate, least lossy. Trailers support repeated keys.

**Recommendation:** (d) for v0.1 — write all open-session IDs as separate trailers. `jejak link <sha>` returns a list. Defer (c) interactive disambiguation to v0.2 when the concurrent-session UX matures.

**Edit needed:** §10.5 — change `prepare-commit-msg` to iterate open sessions; document that `jejak link` returns N sessions per commit; meta.json's `commit_sha` may appear in multiple session metas (that's fine — the commit produced from N sessions).

---

### V3-2. `jejak attach` semantics for the trailer

**Where:** §16.4 (jejak attach)

**The problem:** §16.4 says attach runs the pipeline and writes to the shadow ref. It doesn't say what happens to the commit-to-session link. Two paths:
- **Amend HEAD** to add a `Jejak-Session:` trailer → history rewrite (which was the *reason* Δ-1 chose trailers in the first place).
- **Don't amend** → attached session lives on the shadow ref but is unlinked from any commit. `jejak link <sha>` won't find it.

Either is defensible but the design picks neither.

**Entire's answer:** `entire attach` defaults to amend HEAD with confirmation; `--force` skips the prompt. If the prior commit already has an `Entire-Checkpoint` trailer, the session is added to that existing checkpoint (no amend).

**Recommendation:** Mirror Entire's behavior for v0.1.
- If HEAD's trailers already include `Jejak-Session:`, append the new session ID as an additional trailer (no commit amend; the trailer key supports repeats, see V3-1).
- If HEAD has no `Jejak-Session:` trailer, prompt the user to amend HEAD (`--force` skips the prompt). This is opt-in history rewrite; the user explicitly invoked attach.
- If the user declines the amend, write to the shadow ref anyway with `meta.commit_sha = null` and surface as an "unlinked" session in `jejak log` / `jejak doctor`.

**Edit needed:** §16.4 — spell out the three branches above. Add `--force` flag to `jejak attach`.

---

### V3-3. Build-order S3b before S4 is chicken-and-egg

**Where:** §19 build order

**The problem:** S3b ships `prepare-commit-msg` + trailers. But that hook calls `jejak active-session-id`, which needs the ledger, which is part of S4 (agent hooks + worker + staging). Strict reading of the build order has S3b shipping a hook that can't function.

**Current actual behavior:** the hook script in §10.5 already does `SID=$(...) || exit 0` + `[[ -n "$SID" ]] || exit 0` — it silently no-ops when there's no active session. So pre-S4, the hook installs cleanly and does nothing useful. Once S4 lands, the hook starts stamping trailers. This is the right behavior; it's just not documented.

**Recommendation:** Add a sentence to §19: *"S3b hook script is intentionally inert when the ledger is unavailable or no active session is found; trailers start landing once S4 ships the ledger."* No code change.

**Alternative:** reorder S3b to come after S4 in the build sequence. Slightly more honest, but loses the symmetry of "all hook scaffolding lands together in S3."

---

## Part 3 — Cleanups (small but visible)

### C-1. README is stale

`README.md` was last updated before v0.3:

- **Line 23:** "commits the stripped trace to a shadow ref (`refs/jejak/*`)" — should be `refs/heads/jejak/sessions/v1`.
- **Line 24:** "one file per (developer, session)" — now a directory per session (`events.jsonl.zst` + `meta.json`), and the structure is hash-sharded under handle.
- **Line 35:** `npm i -g jejak` — the design is Python (`shadow_branch.py`, `pii_scanner.py`, etc.); should be `pip install jejak` (or both if there's a Node wrapper planned — but no current evidence of one).
- **Line 34:** `jejak init` description mentions "creates refs/jejak/main" — should be `refs/heads/jejak/sessions/v1`.

Five-minute fix. Update before any external readers see the repo.

### C-2. `jejak active-session-id` is invoked but unlisted

§10.5 calls `jejak active-session-id` inside the `prepare-commit-msg` hook. This subcommand isn't in the CLI table (ARCHITECTURE.md §6) or DESIGN-LLD's CLI surface implicit in §16. Two options:
- Document it as a hidden helper (prefix with `_` or `internal`).
- List it as a public CLI command that humans can also invoke (useful for debugging "which session does jejak think I'm in?").

**Recommendation:** List it publicly. It's a useful diagnostic and Entire has a similar `entire session current` command.

### C-3. `commit_sha` lag on session-end-after-commit

§10.5 says commit_sha "set when trailer is written or detected post-commit via `post-commit` ledger update (v0.1: ledger poll on next capture)". Edge case: user commits, then immediately closes the agent session. SessionEnd fires the final worker, but if the v0.1 mechanism only polls "on next capture" (i.e., next Stop or next session), the final SessionEnd worker may not detect the commit.

**Fix:** SessionEnd worker should run the commit-poll step before writing the final meta.json. `git log -1 --format=%H --grep="Jejak-Session: $SID"` finds the matching commit (if the trailer was written), back-fills `meta.commit_sha`.

**Edit needed:** §5 capture lifecycle or §10.5 — SessionEnd's final worker explicitly polls for commit_sha before writing meta.

### C-4. Staging dir auto-cleanup

§16.2 surfaces orphan staging dirs via `jejak doctor`, but if users rarely run doctor, `~/.jejak/staging/` accumulates. Each session is small (<1 MB after stripping; staging is pre-strip so a few MB), but over hundreds of sessions it's noticeable.

**Fix:** SessionEnd worker `rm -rf ~/.jejak/staging/<session-id>/` after the final shared-ref write succeeds. On error, leave the staging dir for diagnostic purposes — doctor picks it up.

**Edit needed:** §9 staging flow — add cleanup step. §16.2 — note that doctor only shows staging orphans from failed sessions, not normal ones.

---

## Part 4 — What's still good (worth reaffirming)

- **Build-order PII hard gate** (S6 → S5) is correctly enforced.
- **Hash-shard layout** (Δ-3) correctly preserves Layer 1 per-writer partitioning while balancing the tree.
- **PII best-effort framing** matches Entire's posture and avoids overpromising.
- **Trailers + index hybrid** is the right call — trailers for correctness, index for query speed.
- **State machine** (open / partial / captured / captured-with-blocks / failed) is detailed enough for v0.1 without overengineering.
- **`jejak doctor`** check list is comprehensive (10 checks) and concrete enough to implement directly.
- **Path A → Path B migration plan** is explicit in REVIEW-LLD-v2 §Δ-2; v0.2 pickup is straightforward.

---

## Part 5 — Recommended edits, in order

1. **V3-1**: Update §10.5 to emit multiple `Jejak-Session:` trailers when concurrent sessions exist; update `jejak link` to return a list.
2. **V3-2**: Spell out three-branch attach behavior in §16.4; add `--force` flag.
3. **V3-3**: One sentence in §19 noting S3b hook is inert until S4.
4. **C-1**: Update README to reflect actual shadow ref, layout, language.
5. **C-2**: List `jejak active-session-id` in the CLI surface.
6. **C-3**: SessionEnd worker polls for commit_sha before writing final meta.
7. **C-4**: SessionEnd worker cleans up staging on success.

All 7 are small (<1 hour of doc work; V3-1 is ~10 LOC of code change in `prepare-commit-msg` + the `link` command).

After these land, the design is genuinely done. Code can start in parallel — none of the above blocks S1 (JSONL reader) or S2 (shadow_branch.py).

---

## Open items not in v0.3 (carried forward unchanged)

- **Q3 dogfood cohort roster** — still the only input needed before launch. Recommendation in REVIEW-LLD-v2 §Q4: 5-10 engineers, ≥2 on same repo, ≥1 buddy pair on same branch in week 1, ≥1 Linux + ≥1 macOS, 4 weeks minimum.
- **All v0.2 deferrals** intact: Path B two-tier, Jejak-Attribution trailer, pre-turn diff, Cursor adapter, PII quarantine, doctor webhook, checkpoint-remote.

---

*End of review v3.*
