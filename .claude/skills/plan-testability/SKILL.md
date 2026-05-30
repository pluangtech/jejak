---
name: plan-testability
description: Validate that a jejak implementation plan is testable — dependency-injected seams with fakes (no real git or TTY in unit tests), a clear unit-vs-integration split, explicit exit-code assertions, and coverage of failure paths. Use when writing or reviewing a jejak plan's testing strategy, or as part of validate-plan.
---

# plan-testability

Validates the **testability** dimension only. Disjoint from the other plan-* skills (it does
not judge code patterns themselves, distribution, git invariants, or doc consistency).

## Grading discipline (read first)
- Judge whether the plan **can be and plans to be** tested. **PASS** if the PASS-if condition
  holds for the behaviors this plan introduces.
- **GAP** only when a behavior the plan introduces is **untestable as designed** or its
  failure/exit contract is **left untested**. An optional extra assertion that wouldn't catch
  a real defect is a **NOTE**, not a GAP. If a concern is fully covered by unit fakes, the
  absence of a duplicate integration assertion is **not** a GAP.
- **N/A** = criterion doesn't apply (justify). **Verdict: PASS iff zero GAPs.** Same plan →
  same verdict every run.

## Rubric (objective conditions)

| # | Criterion | PASS if | GAP if |
|---|---|---|---|
| T1 | Injectable seams | side-effecting deps (git, prompt, fs, clock) are injectable | a collaborator is hardwired so it can't be faked in tests |
| T2 | No real git/TTY in units | unit tests use fakes; real git/TTY only in integration | unit tests require a real repo or TTY to pass |
| T3 | Unit vs integration split | the plan names what's unit-tested vs exercised in a real temp repo | a git-touching behavior has no integration plan, or logic has no unit plan |
| T4 | Exit-code assertions | every documented exit code (0/1/130/…) is asserted somewhere | an exit code is defined but no test asserts it |
| T5 | Failure-path coverage | error/abort branches (refusal, no-TTY, cancel, resolution failure) are tested | only the happy path is tested |
| T6 | Determinism | nondeterministic inputs are controlled (fakes in units; fixed git config/fixtures where an integration test depends on them) | a test's outcome depends on uncontrolled ambient machine state |

## Output
Verdict table + GAP list + NOTE list + count. Report only; do not edit the plan.
