---
name: plan-architecture
description: Validate that a jejak implementation plan applies the required design patterns and modular, single-responsibility file structure (no god-files). Checks Command-per-verb, Adapter+Registry, Strategy, Chain-of-Responsibility, Pipeline, Facade, Repository, Dependency Injection, and feature-grouped directories. Use when writing or reviewing a jejak plan's architecture/structure, or as part of validate-plan.
---

# plan-architecture

Validates the **architecture & modularity** dimension only. Disjoint from the other plan-*
skills (it does not judge distribution, git invariants, tests, or doc consistency).

## Grading discipline (read first — keeps verdicts deterministic)
- Judge the plan's **design**, not its prose. A criterion is **PASS** if the proposed design
  satisfies the PASS-if condition, even if the wording is terse.
- **GAP** only when the design **violates** the GAP-if condition (would produce a god-file or
  an unextensible structure). Missing restatement of something the design already does is
  **not** a GAP.
- **NOTE** = optional polish (clearer naming, an extra interface) that does not change
  correctness/extensibility. NOTEs never lower the verdict.
- **N/A** = criterion doesn't apply; justify in one line.
- **Verdict: PASS iff zero GAPs** (NOTEs allowed). The same plan must score the same every run.

## Rubric (objective conditions)

| # | Criterion | PASS if | GAP if |
|---|---|---|---|
| A1 | Command per verb | each verb is its own module/registrar and `cli.ts` only composes/registers | verb logic lives in `cli.ts` or one growing switch with no registry |
| A2 | Adapter + Registry | pluggable variants (agents) sit behind an interface + registry; adding one = new file | variant logic hardcoded so adding one edits core detection/picker code |
| A3 | Strategy | runtime-divergent behavior (project vs global) is behind a strategy interface | the divergence is scattered `if mode===` conditionals across modules |
| A4 | Chain of Responsibility | ordered fallback (dev_handle) = list of sources + thin runner | fallback is a hardcoded if/else ladder embedded in a consumer |
| A5 | Pipeline | multi-step orchestration = ordered steps over a shared context | one monolithic `runInit` function performs all steps inline |
| A6 | Facade | the git/process boundary is wrapped in a typed client; callers don't build argv | business logic calls `execFile`/raw git directly |
| A7 | Repository | persistence (config, refs, files) is behind intent-named methods | fs/git persistence is inlined inside business logic |
| A8 | Dependency Injection | side-effecting collaborators (git, prompt, reporter) are injected | consumers import singletons / construct deps internally (can't fake) |
| A9 | Single responsibility | each module owns one concern | a module mixes unrelated concerns (e.g. CLI + parsing + git) |
| A10 | Feature-grouped layout | directories grouped by domain with interface files at the root | flat dump / no interface boundaries |

## Output
A table `# · criterion · verdict · evidence`, then list any GAPs (`criterion · violation · fix`)
and any NOTEs separately. End with the PASS/GAP count. Report only; do not edit the plan.
