---
name: plan-git-safety
description: Validate that a jejak implementation plan respects the shadow-ref and git-plumbing invariants — never checking out the shadow ref, orphan commits, compare-and-swap ref updates, registering the merge.ours driver, keeping .gitattributes on the seed tree only, using merge=union for the append-only index, and documenting idempotency. Use when writing or reviewing a jejak plan that creates commits/refs/trees or touches refs/heads/jejak, or as part of validate-plan.
---

# plan-git-safety

Validates the **git / shadow-ref correctness** dimension only. Disjoint from the other
plan-* skills (it does not judge code patterns, distribution, tests, or doc consistency).

## Grading discipline (read first)
- Judge the **design's behavior**, not prose. **PASS** if the plumbing the plan describes
  meets the PASS-if condition — even if it doesn't restate the invariant in words.
- **GAP** only when the described plumbing **violates** the GAP-if condition (a real
  correctness/safety defect). A missing prose invariant that the plumbing already honors is a
  **NOTE**, not a GAP.
- **N/A** = the plan does no git plumbing (justify). **Verdict: PASS iff zero GAPs.** Same
  plan → same verdict every run.

## Rubric (objective conditions)

| # | Criterion | PASS if | GAP if |
|---|---|---|---|
| G1 | Never checkout shadow ref | the shadow ref is built/mutated via plumbing only (hash-object/write-tree/commit-tree/update-ref); no `checkout`/`switch` of it | the plan checks out the shadow ref or moves HEAD onto it |
| G2 | Orphan commit | the seed commit is created with no parent (`commit-tree` without `-p`) | the seed commit has a parent / is built on HEAD |
| G3 | CAS ref update | ref create/update uses old-value compare-and-swap (`update-ref <ref> <new> <old>`) | a concurrent-capable path uses plain `update-ref` with no CAS |
| G4 | merge.ours.driver registered | `merge.ours.driver true` is set whenever `merge=ours` is used | `merge=ours` is used but the driver is never registered |
| G5 | .gitattributes seed-tree only | shadow merge attributes live only in the seed tree | shadow merge attributes are written to the working tree |
| G6 | merge=union for index | the append-only index uses `merge=union` | the append-only index uses `merge=ours` (drops concurrent appends) |
| G7 | Idempotency | re-run is guarded (ref-exists short-circuit) and creates no duplicate commits | re-run duplicates commits or has no existence guard |
| G8 | Single plumbing seam | seed-tree build and later upsert share one tree-building mechanism | two divergent tree-building code paths are proposed |

## Output
Verdict table + GAP list + NOTE list + count. Report only; do not edit the plan.
