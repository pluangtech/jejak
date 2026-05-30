---
name: plan-docs-consistency
description: Validate that a jejak implementation plan stays consistent with the project's design docs — it must not silently contradict CLI-SPEC.md, DESIGN-LLD.md, or IMPLEMENTATION-ORDER.md, must list the doc updates it forces when it changes a locked decision, and must honor resolved review findings (the R-n entries). Use when writing or reviewing a jejak plan that changes behavior recorded in the design docs, or as part of validate-plan.
---

# plan-docs-consistency

Validates the **doc reconciliation** dimension only. Disjoint from the other plan-* skills
(it does not judge code patterns, distribution choices, git invariants, or tests — only
whether the plan and the committed design docs agree).

## Grading discipline (read first)
- Cross-check the plan against `docs/CLI-SPEC.md`, `docs/DESIGN-LLD.md`,
  `docs/IMPLEMENTATION-ORDER.md`, and any `docs/plans/*` it supersedes.
- **PASS** if the PASS-if condition holds. **GAP** only when the plan **silently** diverges
  from a doc or **reintroduces** a resolved finding. A divergence that the plan **explicitly
  flags** (with a reconcile list) is **PASS** — calling it out is the requirement. Wording
  improvements are **NOTEs**.
- **N/A** = the plan changes nothing recorded in the docs (justify). **Verdict: PASS iff zero
  GAPs.** Same plan → same verdict every run.

## Rubric (objective conditions)

| # | Criterion | PASS if | GAP if |
|---|---|---|---|
| C1 | No silent contradiction | every divergence from the design docs is explicitly called out | the plan changes documented behavior without flagging it |
| C2 | Lists forced doc updates | locked-decision changes enumerate the docs to update (file + section) | a locked decision is changed with no update list |
| C3 | Honors resolved findings | no resolved review finding (R-n) is silently reintroduced or violated | a resolved R-n is reintroduced/violated without justification |
| C4 | Exit codes / flags match spec | flags/exit codes match CLI-SPEC, or the change is listed in the reconcile set | a flag/exit code mismatches the spec and isn't listed |
| C5 | Terminology consistency | uses the docs' terms (init/setup/install; shadow ref name; handle) | conflates terms in a way that changes meaning |
| C6 | Cross-references resolve | cited sections/findings/items exist in the referenced docs | a reference is dangling |

## Output
Verdict table + GAP list + NOTE list + count. Report only; do not edit the plan.
