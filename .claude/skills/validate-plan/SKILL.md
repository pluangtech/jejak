---
name: validate-plan
description: Validate a jejak implementation plan against all project engineering guardrails by running the five focused plan-* checks (architecture, distribution, git-safety, testability, docs-consistency) and aggregating one scorecard. Use when the user asks to validate/review/check an implementation plan, before approving a plan, or after writing a plan in docs/plans/. Takes an optional plan path argument; defaults to the active plan or the newest file in docs/plans/.
---

# validate-plan (umbrella)

Runs jejak's five **non-overlapping** plan-validation skills and aggregates their results.
This skill holds **no criteria of its own** — each rubric lives in exactly one sub-skill, so
there is a single source of truth per dimension.

## Inputs
- `$1` (optional): path to the plan markdown. If omitted, use the active plan, else the most
  recently modified file under `docs/plans/`.

## Procedure
1. Resolve the target plan path; read it once.
2. Run each sub-skill against that plan, in this order:
   1. `plan-architecture`
   2. `plan-distribution`
   3. `plan-git-safety`
   4. `plan-testability`
   5. `plan-docs-consistency`
   Apply each skill's rubric exactly as written there (do not invent or duplicate criteria).
3. Collect each skill's per-criterion verdicts (`PASS` / `GAP` / `N/A`).

## Output (single scorecard)
Print one section per dimension with its verdict table, then a roll-up:

```
## Plan validation scorecard — <plan path>

| Dimension            | PASS | GAP | N/A |
|----------------------|------|-----|-----|
| Architecture         |      |     |     |
| Distribution         |      |     |     |
| Git safety           |      |     |     |
| Testability          |      |     |     |
| Docs consistency     |      |     |     |
| TOTAL                |      |     |     |

Verdict: PASS (0 GAPs) | NEEDS WORK (<n> GAPs)
```

For every `GAP`, list: `dimension · criterion · what's missing · concrete fix`.

## Grading discipline (deterministic — same plan must score the same every run)
- Judge the plan's **design**, not its prose. A criterion is **PASS** when the design meets
  the sub-skill's PASS-if condition, even if terse.
- **GAP** = the design **violates** a criterion (a real correctness/safety/extensibility
  defect). Missing restatement of something the design already does is a **NOTE**, never a GAP.
- **NOTE** = optional polish; it does **not** affect the verdict.
- **Verdict: PASS iff zero GAPs** (any number of NOTEs is still PASS).
- If a re-run would change a verdict, the criterion was applied subjectively — re-judge by the
  PASS-if/GAP-if conditions, not by gut feel.

## Rules
- Be evidence-based: cite the plan section/line that satisfies (or fails) each criterion.
- `N/A` is allowed only with a one-line justification (e.g. "no git plumbing in this plan").
- Surface NOTEs separately from GAPs so the verdict stays driven only by GAPs.
- Do not modify the plan; only report. The caller decides whether to apply fixes.
