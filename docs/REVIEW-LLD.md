# Architect Review — DESIGN-LLD.md

**Reviewer role:** Software Architect (adversarial)
**Date:** 2026-05-30
**Verdict:** **Approve with required changes.** Four issues need to be resolved before implementation starts. The stress-test pass caught most of the structural problems; the issues below are what it missed.

---

## Strong points (briefly, so the rest of the review has context)

- Stress-test discipline (§1) is exactly the right posture — finding ST-01..18 before code beats finding them after.
- Adopting Finn's shadow-ref convention (§2) over the original `refs/jejak/*` proposal is correct and well-justified.
- Per-writer path partitioning is preserved despite the layout change.
- Single-flight lock (ST-05) and dedup-excludes-volatile-meta (ST-06) are real catches.
- Mermaid diagrams are at the right level — they communicate, don't pad.
- The invariants checklist (§18) gives reviewers a concrete acceptance gate.

OK, the review:

---

## Critical — must resolve before implementation

### C-1. Tree composition strategy is unspecified, and `git mktree` doesn't scale flat

§10 shows `mktree_upsert(session_path(session_id), events_blob, meta_blob)` as a single call. `git mktree` builds **one** tree level at a time — it doesn't recursively compose. The shadow ref's tree at year-end looks like:

```
sessions/2026-05/alice/sess_001/{events.zst, meta.json}
sessions/2026-05/alice/sess_002/...
sessions/2026-05/bob/...
sessions/2026-06/...
```

Composing this requires `mktree` at every directory level: leaf → session-id → handle → month → sessions → root. Each commit re-composes all intermediate trees above the touched leaf. At team scale (50 devs × 5 sess/day × 250 days = 62.5K sessions/year), the year-end tree has 62.5K leaves and proportional intermediate trees. `git read-tree` and `git ls-tree -r` slow down measurably past 10K entries; `git mktree` invocations multiply.

**Fix**: 
- Specify the tree composition algorithm explicitly. Pattern: read the current tree, walk to the target path, compose new subtrees from leaf up using one `mktree` per level, splice back at root.
- Plan for archival. Add a §11.1: "Sessions older than N months get archived to `refs/heads/jejak/sessions/v1-archive-<YYYY-Q>` and pruned from the live ref. Implemented in v0.3; live ref stays under 20K sessions."
- Re-check Finn's `shadow_branch.py` — it's been running long enough to have hit this. Borrow the exact composition function.

### C-2. The Layer 3 merge operation isn't actually specified

§12 / §15 say "git merge FETCH_HEAD into local shadow ref" / "git merge origin/jejak/sessions/v1". This is **not** a normal `git merge` — that command requires a working tree checkout, and the shadow ref is an orphan branch with no checkout. You need one of:

1. **`git merge-tree` + `git commit-tree` + `git update-ref`** — manually compose a merge commit. Works for the disjoint-paths case but requires explicit handling of merge bases.
2. **Temporary worktree** — `git worktree add /tmp/jejak-merge refs/heads/jejak/sessions/v1`, `git merge`, `git worktree remove`. Heavier; easier to get right.
3. **Per-writer push refs + server-side merge** — push to `refs/heads/jejak/sessions/v1/<handle>` (per-writer), let a GitHub Action or post-receive hook merge into `v1`. Eliminates client-side merge entirely.

Pick one. Document the actual commands. Option 3 is the cleanest for a multi-dev team but requires server-side infrastructure; Option 1 is the most jejak-native. Don't ship until this is specified — "git merge" hand-waves over the actual problem.

### C-3. `.gitattributes` location for `merge=union` is unclear

§12 + §18 say `index/*/by-commit.ndjson` gets `merge=union` from `.gitattributes`. But:

- `.gitattributes` on `main` doesn't apply to merges happening on `refs/heads/jejak/sessions/v1` (different branch context).
- The shadow ref is an orphan with no working tree, so the standard "checkout the branch, read its `.gitattributes`" path doesn't fire either.

`merge=union` is honored when git is invoked in a worktree where `.gitattributes` is present **at the right path**. For the shadow-ref merge to use it, you need either:

- The shadow ref's own root contains a `.gitattributes` that gets read during the merge — depends on which Option you picked in C-2.
- Or a `core.attributesFile` global config pointing to a jejak-managed file.

Spell this out. Without it, the "Layer 2 union merge" line of defense is a paper invariant.

### C-4. Single-flight "coalesce" silently drops events

ST-05 chose "second worker exits early or waits (prefer: coalesce — if lock held, exit 0)." Walk through the sequence:

```
t=0   Stop fires. Worker A starts. Acquires lock. Reads events 1-100. Begins write.
t=1   Stop fires again. Worker B starts. Lock held. exit 0.
t=2   Worker A commits offset=100, releases lock.
       Events 101-150 written between t=0 and now are now uncaptured 
       until the NEXT Stop fires.
```

If the user closes the IDE between t=2 and the next Stop, events 101-150 are lost (SessionEnd fires, but if there's no new Stop trigger between A's release and SessionEnd, the worker spawned by SessionEnd captures them — OK in this case). But: if A errors out and never advances the offset, B's exit means we lose visibility entirely.

**Fix**: coalesce should mean **trigger re-run**, not silent skip.
- Worker A on completion checks a "pending=true" flag, and if set, immediately re-runs.
- Worker B, on finding lock held, sets the flag and exits 0.
- Implementation: `~/.jejak/locks/<repo-hash>/<session-id>.pending` file. A touches it, B writes it, A unlinks it after successful re-run.

Document the flag-and-rerun pattern in §6.2 explicitly. The current diagram shows "exit 0 coalesce" with no rerun trigger.

---

## Important — fix before dogfood ships

### I-1. `--force-with-lease` is the wrong primitive for a shared-write ref

§2 + §15 use `git push --force-with-lease` on the shared shadow ref. `--force-with-lease` is designed for *single-writer* refs (one dev's feature branch). On a shared ref, every dev's local view of "origin tip" diverges seconds after a teammate pushes. Result: legitimate pushes fail their lease check constantly, even when the underlying merge would be trivial.

The right primitives for shared-write refs:
- **`git push` (no force)** with the fetch-merge-push wrapper. If push rejects, fetch-merge-retry. Loop until success or N attempts. No `--force-with-lease`.
- **`git push --atomic`** if pushing multiple refs at once (you're not).

Replace `--force-with-lease` with a plain `git push` inside a retry loop. The merge is already conflict-free by Layer 1 design, so the loop converges.

### I-2. Thinking-block stripping is too aggressive

§8 strips thinking blocks to "first 500 + last 500 + token count". That's ~1 KB per thinking block. Thinking blocks contain the *why* — the model's reasoning chain for the decision. Prompts are kept verbatim (much bigger), tool calls are kept fully (often bigger), but the most diagnostically valuable content gets crushed.

**Recommendation**: keep thinking verbatim by default. Cap at 4 KB only if a single block exceeds it. Strip them entirely behind a `--strip-thinking` config flag for orgs that consider model reasoning sensitive.

The 90% size-reduction target is still achievable from tool result bodies alone — those are the actual bulk (file reads, grep outputs, web fetches). Thinking blocks are <5% of session size typically.

### I-3. Build order ships dogfood before PII (step 9 before step 6)

§19 has dogfood at step 9 and PII dispatcher at step 6. But the dependency arrows show `S4 → S5, S6, S7` (parallel branches), so PII isn't a hard prerequisite for `S5: jejak push`. Result: someone could read the build order, ship steps 1-5, and start pushing un-PII-scrubbed traces to origin.

**Fix**: make S6 (PII) a hard prerequisite of S5 (push). The dependency arrow should be `S4 → S6 → S5`. Or add a literal block in the build order: "S5 SHALL NOT be merged to main until S6 is shipped."

### I-4. Reader doesn't handle session resume

§7 marks live status via `mtime > now-60s AND session status open`. But Claude Code resumes sessions (`SessionStart matcher: resume`). After resume, the ledger has `status=captured` for that session_id from the prior run. New events get appended to the same JSONL. The reader's live-detection condition is false (status != open), so the new events are missed.

**Fix**: on `SessionStart` with `matcher=resume`, if the ledger has the session and `status=captured`, set it back to `open` and re-tail from current offset. Document this in §5 and add a state-machine transition `captured → open` to §14.

### I-5. `jejak doctor` is referenced but never defined

It's mentioned in §6.1, ST-08, ST-10, §18, §20 as the user-visible diagnostic surface. Never specified. At minimum:

- Stale sessions (ledger `status=open` with `last_event_ts > 1h ago`).
- Dispatch log error/warn count in the last 7 days.
- Shadow ref tip vs origin (ahead/behind).
- Lock file presence (orphaned locks).
- Hook installation verification (settings.json reads matching).
- Filesystem warnings (NFS / iCloud / Dropbox detected — ST-10).

Add a §16.5 or §17.5 for `jejak doctor` checks. Without it, "jejak doctor surfaces X" is an empty promise across multiple sections.

---

## Minor — nice to fix but won't block ship

| # | Issue | Recommendation |
|---|---|---|
| M-1 | Email pattern as `warn` in §9 | Default-off. Customer/teammate emails are everywhere; warning is invasive at team scale. Add via `.jejak/pii.yaml` opt-in. |
| M-2 | Stripper R6 (duplicate-read back-ref) ROI is low | Most "duplicate reads" are bracketed by edits → different SHAs → no match. Keep, but don't expect it to move the size needle. Measure in dogfood. |
| M-3 | Branch name captured in `meta.json` (§11) | Branch names leak ticket numbers, codenames. Add `jejak.capture_branch_name` config flag, default true, document the risk. |
| M-4 | `meta.json` `blocked_event_ids` doesn't preserve content for audit | v0.2: blocked content → local-only quarantine at `~/.jejak/quarantine/<session-id>/`. Never pushed. Surfaced by `jejak doctor`. |
| M-5 | `status: captured \| failed` is too binary | Add `captured-with-blocks` and `partial` to the enum. Cheap to add now, painful to add later (migration). |
| M-6 | `produced_commits[]` detection unspecified | Heuristic: walk `git reflog --since=<started_at> --until=<ended_at>` filtered by author. Document the heuristic explicitly with its known failure modes. |
| M-7 | Dispatch log out-of-repo means team can't see Alice's silent failures | v0.2: opt-in `jejak doctor --report` posts a sanitized summary to a configured webhook (Slack, GitHub issue). |
| M-8 | Clock skew across devs | Use git commit timestamps (server-stamped on push) for ordering in `jejak log --since`, not `meta.started_at`. |
| M-9 | `jejak uninstall` is missing | Required for dogfood. Removes hooks from settings.json, optionally purges `~/.jejak/`, leaves shadow ref intact (it's a separate decision). |
| M-10 | `start_sha` recorded but no commitment about uncommitted state | Already captured as `working_tree_dirty: bool`. Worth: also hash the working-tree diff if dirty, so `jejak link <commit>` can map back even when the session pre-dates the commit. v0.2. |

---

## Things I'd ask before signing off

1. **Tree composition algorithm (C-1)** — do you want to write this from scratch or lift Finn's? Lifting is faster but pulls in their decisions about subtree caching, which may not fit jejak's simpler scope.
2. **Merge strategy (C-2)** — Option 1 (merge-tree client-side) vs Option 3 (per-writer push refs + server-side merge). Option 3 is more robust for teams but adds a GitHub Action dependency. Appetite for server-side infrastructure?
3. **PII catalog scope** — are you OK shipping v0.1 with ~6 patterns, or should we expand based on actual secret-leak history before launch?
4. **Dogfood cohort** — 2-4 weeks is the plan. Who's in the cohort? If it's just you + 1-2 others, the multi-writer paths (C-2, C-3, C-4, I-1) won't get exercised hard enough to surface bugs. Recommend a 5-10 person cohort with at least 2 on the same repo.

---

## Recommended changes before implementation kicks off

1. Update §10 with the explicit tree composition algorithm (C-1).
2. Update §12/§15 with the chosen merge strategy and the actual git commands (C-2).
3. Specify `.gitattributes` placement and which branch's attributes apply at merge time (C-3).
4. Rewrite §6.2 single-flight to use the flag-and-rerun pattern (C-4).
5. Replace `--force-with-lease` with `git push` + fetch-merge-push retry loop (I-1).
6. Raise the thinking-block cap to 4 KB or remove it (I-2).
7. Add a hard dependency `S6 → S5` in the build order (I-3).
8. Add `captured → open` transition on resume in §5 and §14 (I-4).
9. Add §16.5 `jejak doctor` checks (I-5).
10. Update ARCHITECTURE.md with the resolved decisions from §2 *and* the changes above.

After those land, this is implementation-ready.

---

## What I'm explicitly *not* worried about

- v0.1 scope (Claude Code only) is correct. Don't expand.
- SQLite ledger vs JSON-only — SQLite is right. The dispatch log alone makes JSON-only painful.
- Deferring summarization, watcher, replay to v0.2+. All correct.
- Subagent capture deferral. The Claude Code JSONL has parent events inline; you lose almost nothing by waiting.
- The "drafts out-of-repo, finalized in-repo" pattern from Finn. You correctly skipped it — direct-to-shadow on SessionEnd is simpler for v0.1.
