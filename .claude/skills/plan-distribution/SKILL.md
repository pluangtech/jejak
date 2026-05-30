---
name: plan-distribution
description: Validate that a jejak implementation plan gets onboarding and distribution right — hybrid project-devDependency + global-install, polyglot repos, committed-vs-per-developer config split, and no per-developer install/init anti-pattern. Use when writing or reviewing a jejak plan that touches install, init, setup, config, or how teammates get capture working, or as part of validate-plan.
---

# plan-distribution

Validates the **onboarding & distribution** dimension only. Disjoint from the other plan-*
skills (it does not judge code patterns, git plumbing internals, tests, or doc consistency).

## Context (jejak's settled model)
Capture is local & per-developer (agent hooks on each machine). The fix for onboarding
friction is to **commit shared decisions once** and **auto-resolve per-dev state lazily** —
not to make every teammate run an interactive setup.

## Grading discipline (read first)
- Judge the **design**, not prose. **PASS** if the design meets the PASS-if condition.
- **GAP** only when the design **violates** the GAP-if condition. **NOTE** = optional polish;
  never lowers the verdict. **N/A** = doesn't apply (justify).
- **Verdict: PASS iff zero GAPs.** Same plan → same verdict every run.

## Rubric (objective conditions)

| # | Criterion | PASS if | GAP if |
|---|---|---|---|
| D1 | Hybrid distribution | plan supports both project devDependency and global install | only one is supported with no path for the other |
| D2 | Polyglot | non-Node repos work (package.json use is guarded) | the plan cannot function without a package.json |
| D3 | Config split | repo-wide decisions (agent, mode) are committed; per-dev state is local/git-config | a per-dev identity is committed, or a repo-wide decision is forced per-dev |
| D4 | No per-dev anti-pattern | project-mode teammates don't repeat interactive init/setup | every teammate must run an interactive init to capture |
| D5 | Lazy idempotent bootstrap | handle + shadow-ref ops are idempotent and reachable from the capture/hook path | bootstrap runs only inside init (teammates who skip init can't capture) |
| D6 | dev_handle not committed | dev_handle is resolved per-dev at runtime | dev_handle is stored in the committed config |
| D7 | Portable hook invocation | project mode uses a portable invocation (npx) and global embeds the path | committed hooks embed a machine-specific absolute path |

## Output
Verdict table + GAP list + NOTE list + count. Report only; do not edit the plan.
