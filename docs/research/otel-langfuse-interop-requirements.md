# Requirements: OpenTelemetry / Langfuse Interoperability for jejak

| | |
|---|---|
| **Status** | Draft — for review (not approved, not scheduled) |
| **Type** | Requirements / RFC (pre-implementation) |
| **Owner** | _(assign)_ |
| **Reviewers** | _(assign — maintainers + 1 observability-stack user)_ |
| **Created** | 2026-06-09 |
| **Decision needed by** | _(set after circulation)_ |
| **Companion research** | [`observability-standards-and-jejak.md`](./observability-standards-and-jejak.md) |
| **Supersedes / relates to** | ATIF deferral in `docs/REVIEW-LLD-v2.md` |

> **What this document is.** A circulation draft to get feedback *before* writing an
> implementation plan. It states the current situation, condenses the research, and
> proposes a scoped set of requirements with explicit goals, non-goals, anti-requirements,
> and open questions. Nothing here is committed. The ask to reviewers is in §10.

---

## 1. Summary (the ask)

The AI-tooling industry is converging on a standard vocabulary for "what an LLM/agent did"
— OpenTelemetry's **GenAI semantic conventions** and **Langfuse** (an OSS LLM-observability
product built on OTel that ingests raw OTLP). This document proposes how, and how much,
that standardization should touch jejak.

**Proposed position:** jejak should be a **one-way producer** of the standard (an OTLP
exporter), **never an ingestion backend or an observability platform**. The work is tiered:

- **Tier 1 (propose for v0.1, ~0.5 day):** protect the future mapping — an ADR + a
  conformance test. No schema or storage change.
- **Tier 2 (propose for v1, gated on real demand):** ship `jejak export --format otlp`.
- **Tier 3 (explicitly reject):** OTel-native capture / internal `gen_ai.*` schema rename.

Reviewers are asked to confirm or challenge this position and the requirements in §6–§7.

---

## 2. Current situation (what jejak does today)

Grounded in `src/strip/types.ts`, `src/analytics/aggregate.ts`, and `docs/DESIGN-LLD.md`.

- **Unit of capture = a session** (one Claude Code session, `SessionStart`→`SessionEnd`,
  keyed by `session_id`).
- **Each transcript line → a `StrippedEvent`**: `id`, `parentId`, `type`, `timestamp`,
  `role`, `model`, `usage`, `stopReason`, `requestId`, `durationMs`, `isSidechain`,
  `isMeta`, `content[]`, `text`, `meta`.
- **`usage`** captures granular token economics: `inputTokens`, `outputTokens`,
  `cacheCreation{5m,1h}Tokens`, `cacheReadTokens`, `serviceTier`, `inferenceGeo`, `speed`,
  `webSearchRequests`, `webFetchRequests`.
- **Content blocks** (`text`/`thinking`/`tool_use`/`tool_result`) with large payloads
  content-addressed to git blobs (`sha`/`bytes`/`preview`); linkage via `toolUseId`.
- **`SessionMeta` (`meta.json`)**: `session_id`, `agent`, `dev_handle`, `status`,
  `event_count`, `turn_count`, `started_at`/`ended_at`, `duration_ms`, `models[]`,
  `tokens{}`, `web_tool_use{}`, `cost_usd`, `pricing_version`, `commit_sha`, `redactions[]`.
- **Storage:** gzipped `events.jsonl.gz` + `meta.json`, sharded per developer handle, under
  the orphan shadow ref `refs/heads/jejak/sessions/v1`; written via git plumbing; merged
  client-side over disjoint per-handle subtrees.
- **Git anchor:** sessions link to the commits they produced via `Jejak-Session:` commit
  trailers (`jejak link <sha>`).

**Current stance on standards (v0.1):** none adopted. `docs/REVIEW-LLD-v2.md` records a
deliberate decision *not* to adopt ATIF: *"jejak's stripped schema v1 is specific to the
capture-and-replay use case. Adopting [a generic interchange format] would force a broader
scope. Revisit in v1."* No OTel SDK, no Langfuse integration, no export path exists.

---

## 3. Research condensed (full version in the companion doc)

- **OpenTelemetry** standardizes three signals — traces (a DAG of **spans** with
  `TraceId`/`SpanId`/`ParentId`, attributes, events, start/end times), metrics, and logs.
- **OTel logs are deliberately not a new schema.** OTel "embraces existing logging" and
  defines a `LogRecord` data model that *wraps* whatever rich format you already produce,
  adding correlation fields (`TraceId`, `SpanId`, `Timestamp`, `Attributes`, `Resource`).
  This is the closest analogue to jejak's situation.
- **GenAI semantic conventions** give an LLM/agent vocabulary: client spans
  (`gen_ai.request.model`, `gen_ai.usage.{input,output}_tokens`,
  `gen_ai.response.finish_reasons`, `gen_ai.input/output.messages`), and agent spans
  (`create_agent` / `invoke_agent` / `execute_tool` / workflow; `gen_ai.agent.*`,
  `gen_ai.conversation.id`, `gen_ai.tool.name`). **These conventions are still evolving
  and not yet stable** — vendors map/extend rather than freeze them.
- **Langfuse** = traces ⊃ observations (span / **generation** / event) grouped into
  **sessions**, plus **scores** (evals). Langfuse states an observation *is* an OTel span;
  a generation is an OTel span + LLM fields (`model`, `usage_details`, `cost_details`).
  Langfuse **ingests raw OTLP** at `/api/public/otel`, so a single OTLP producer reaches
  Langfuse *and* every other OTel backend.

**Key finding:** jejak's data is a *richer superset* of the GenAI conventions (it ships
cache-tier token splits, versioned per-turn cost, finish reasons), and the one thing it
has that neither standard models is the **durable git anchor**. The natural integration is
therefore a **boundary projection** (export), exactly how OTel itself treats logs — not an
internal re-architecture.

---

## 4. Problem statement / why consider this at all

1. **Reach.** Teams that already run Langfuse/Datadog LLM Observability want agent-session
   cost and behavior in their existing dashboards without a second tool.
2. **Aggregation & eval gaps.** jejak's CLI (`log`/`show`) is per-session; it has no
   cross-session analytics and no scoring/eval layer. Observability backends do.
3. **Future-proofing.** If the GenAI conventions stabilize and a second agent (Cursor,
   Codex) lands, a standard vocabulary across agents becomes more valuable.
4. **Avoiding a silent trap.** Without an explicit decision, a future refactor could drop a
   field (e.g. `toolUseId`) that quietly forecloses a clean export later.

None of these are v0.1 blockers. (1)–(3) are demand-gated v1 concerns; (4) is the only
*now* item and it's nearly free.

---

## 5. Goals and non-goals

### Goals
- **G-1** Keep jejak's git-native, capture-after, proprietary storage and schema intact.
- **G-2** Make standardization an **output adapter**, not a storage/architecture decision.
- **G-3** With one adapter (OTLP), reach the whole OTel ecosystem (Langfuse, Datadog, etc.).
- **G-4** Preserve and surface jejak's differentiators on export (cost, git anchor).
- **G-5** Keep the v0.1 "don't adopt yet" decision, but make it *deliberate and protected*.

### Non-goals
- **NG-1** Real-time / live instrumentation of agents (jejak is batch-from-transcript).
- **NG-2** Becoming an OTLP/telemetry **ingestion backend**.
- **NG-3** Positioning jejak as an LLM-observability **platform** that competes with
  Langfuse/Datadog.
- **NG-4** Renaming internal fields to `gen_ai.*` or otherwise binding the internal schema
  to the (unstable) GenAI conventions — at this time.
- **NG-5** A Langfuse-*specific* integration (emit the open standard instead).

---

## 6. Requirements

### Tier 1 — protect the mapping (proposed for v0.1)

- **FR-1** Add an Architecture Decision Record stating: jejak's relationship to
  OTel/Langfuse is a **one-way OTLP producer**; jejak will not adopt OTel internally nor
  ingest OTLP; here is the export field mapping (Appendix A). Mirrors the ATIF deferral.
- **FR-2** Add a **conformance test** asserting that `StrippedEvent` + `SessionMeta`
  retain every field the Appendix-A mapping depends on: `session_id`, `requestId`,
  `parentId`, `toolUseId`, `timestamp`/`started_at`/`ended_at`, `stopReason`, the full
  `usage` breakdown, `model`/`models[]`, `cost_usd`, `commit_sha`, `agent`. The test is a
  **regression tripwire**, not a feature — it fails loudly if a refactor drops a field the
  future exporter needs.
- **NFR-1** Tier 1 introduces **no** new runtime dependency, no schema change, no storage
  change, and no new CLI surface.

### Tier 2 — the OTLP exporter (proposed for v1, gated per §8)

- **FR-3** Provide `jejak export --format otlp [--session <id> | --since <ref> | --all]`
  that reads stripped sessions and emits OTel GenAI-conformant spans.
- **FR-4** Mapping (full table in Appendix A):
  - Session → **trace**; `gen_ai.conversation.id = session_id`; `gen_ai.agent.name = agent`.
  - Turn (`requestId`) → `invoke_agent` / client span carrying `gen_ai.request.model`,
    `gen_ai.usage.*`, `gen_ai.response.finish_reasons`.
  - `tool_use`/`tool_result` → child `execute_tool` spans keyed by `toolUseId`.
- **FR-5** jejak-unique data rides as **namespaced custom attributes**:
  `jejak.cost_usd`, `jejak.commit_sha`, `jejak.dev_handle`, `jejak.pricing_version`, and
  the cache-tier token splits OTel doesn't model.
- **FR-6** Output transport: OTLP over **HTTP (JSON and protobuf)** — the lowest common
  denominator Langfuse and most backends accept. gRPC out of scope for first cut.
- **FR-7** Respect jejak's privacy posture: prompt/response **content** export is
  **opt-in** (default off), matching both jejak's redaction stance and the GenAI
  conventions' opt-in content recording. Redactions already applied at capture must not be
  reversed on export.
- **NFR-2** The fold from line-grained events → operation-grained spans MUST be a **pure
  function** over the stripped stream (no git, no TTY, no network in the core) so it is unit
  testable in jejak's existing style; network egress is a thin, separately-tested edge.
- **NFR-3** Exporter output is **versioned** (e.g. `jejak.export.schema_version`) so the
  unstable upstream GenAI conventions can churn behind a stable jejak boundary.
- **NFR-4** Export is **one-way and stateless** w.r.t. jejak storage — it never writes back
  to the shadow ref and never mutates captured data.

### Tier 3 — explicitly rejected (record the rejection)

- **XR-1** Re-architecting capture around the OTel SDK / live instrumentation — rejected
  (conflicts with NG-1; jejak is capture-after).
- **XR-2** Renaming internal schema fields to `gen_ai.*` — rejected at this time
  (conflicts with NG-4; spec is unstable; loses jejak's superset fields). Re-open only per
  §8 trigger.

---

## 7. Anti-requirements (hard constraints)

- **AR-1 — Producer, not consumer.** jejak emits OTLP; it never ingests it. No endpoint,
  no retention model, no query layer. (Enforces NG-2.)
- **AR-2 — Feeder, not platform.** Docs and positioning describe jejak as feeding an
  observability stack, never replacing one. No dashboards/alerting/eval-UI in jejak.
  (Enforces NG-3.)
- **AR-3 — Standard, not vendor.** Emit OTLP/OTel GenAI; do not build a Langfuse-specific
  client. Langfuse is one consumer among many. (Enforces NG-5.)
- **AR-4 — The git anchor is never standardized away.** `commit_sha` and the session→commit
  binding survive as custom attributes on export; they remain jejak's differentiator.

---

## 8. Triggers (when Tier 2 / Tier 3 unlock)

- **Build Tier 2** when ≥1 real team requests it with the shape *"we already live in
  Langfuse/Datadog and want agent sessions there too."* Until then it is speculative and
  stays unbuilt (Tier 1 keeps the door open at ~0 cost).
- **Re-open Tier 3 (XR-2)** only when **both**: the OTel GenAI semantic conventions are
  declared **stable**, *and* a second agent (Cursor/Codex) is supported — at which point a
  shared cross-agent vocabulary may earn its keep.

---

## 9. Risks and mitigations

| ID | Risk | Mitigation |
|---|---|---|
| RK-1 | GenAI conventions churn breaks the exporter | Versioned boundary (NFR-3); map/extend, don't freeze |
| RK-2 | Scope creep toward "observability platform" | AR-1/AR-2 as standing constraints; reviewer gate |
| RK-3 | Content export leaks secrets | Opt-in content (FR-7); reuse capture-time redaction; never un-redact |
| RK-4 | Event→span fold loses fidelity (line vs. operation granularity) | Pure-function fold (NFR-2) with golden-file tests; all linkage fields present (`requestId`/`parentId`/`toolUseId`) |
| RK-5 | Building speculatively with no demand | Demand gate (§8); Tier 1 is the only unconditional spend |
| RK-6 | Data now lives in two places (repo + backend) with different retention | Position as feed, not source of truth (AR-4); repo remains authoritative |

---

## 10. What we're asking reviewers to decide

1. **Position:** Do you agree jejak should be a **one-way OTLP producer**, never an
   ingestion backend or platform (§1, §7)? If not, what's the alternative and why?
2. **Tier 1 now:** Approve the ADR + conformance test for v0.1 (FR-1, FR-2)? Any field
   missing from the FR-2 list?
3. **Tier 2 gating:** Is the demand gate in §8 the right trigger, or should the exporter be
   scheduled regardless?
4. **Standard vs. vendor:** Agree we emit OTLP and treat Langfuse as one consumer (AR-3),
   rather than building a Langfuse-native integration?
5. **Eval/scores (open question):** The one real capability gap is evaluations/scores
   (Langfuse has them; jejak doesn't). Option: build **git-anchored scores** committed to
   the shadow ref (keep eval data in the repo). In scope to spec now, or defer? (§Appendix B)
6. **Content export default:** Confirm prompt/response content export is opt-in/off by
   default (FR-7)?

---

## Appendix A — Export field mapping (the contract Tier 1 protects)

| jejak | OTel GenAI / OTLP | Notes |
|---|---|---|
| `session_id` | trace id + `gen_ai.conversation.id` | one session = one trace |
| `agent` (`claude-code`) | `gen_ai.agent.name`, `gen_ai.provider.name=anthropic` | |
| `dev_handle` | `jejak.dev_handle` (custom) + resource attr | actor |
| turn (`requestId`) | `invoke_agent`/client span id | grouping unit for the fold |
| `parentId` | span `ParentId` | nesting |
| `model` / `models[]` | `gen_ai.request.model` / `gen_ai.response.model` | |
| `usage.inputTokens` | `gen_ai.usage.input_tokens` | |
| `usage.outputTokens` | `gen_ai.usage.output_tokens` | |
| `usage.cacheCreation{5m,1h}Tokens`, `cacheReadTokens` | `jejak.usage.*` (custom) | OTel has no cache-tier split |
| `usage.serviceTier`/`inferenceGeo`/`speed` | `jejak.usage.*` (custom) | jejak superset |
| `stopReason` | `gen_ai.response.finish_reasons` | |
| `tool_use`/`tool_result` (`toolUseId`) | child `execute_tool` span, `gen_ai.tool.name` | folded from blocks |
| `text`/`thinking`/messages | `gen_ai.input/output.messages`, `gen_ai.system_instructions` | **opt-in only** (FR-7) |
| `timestamp`, `started_at`/`ended_at`, `durationMs` | span start/end | |
| `cost_usd`, `pricing_version` | `jejak.cost_usd`, `jejak.pricing_version` (custom) | OTel doesn't model cost |
| `commit_sha` / `Jejak-Session` trailer | `jejak.commit_sha` (custom) | **the differentiator** |
| `redactions[]` | `jejak.redactions` (custom, counts only) | never export redacted content |

## Appendix B — Optional future: git-anchored scores

The only capability the standards expose that jejak lacks is **evaluations/scores**
(Langfuse first-class). If pursued, the jejak-native form is scores **committed to the
shadow ref** and attached to a session — keeping eval data permanent and in-repo rather
than outsourced to a backend. This turns a gap ("Langfuse has it, we don't") into a
differentiator ("we have it *and* it travels with the code"). Out of scope for Tier 1–2;
listed for reviewer input per §10.5.

## Appendix C — Sources

See the companion research note
[`observability-standards-and-jejak.md`](./observability-standards-and-jejak.md) §Sources
for the full OpenTelemetry, GenAI semantic-convention, and Langfuse citations.
Internal grounding: `src/strip/types.ts`, `src/analytics/aggregate.ts`,
`docs/DESIGN-LLD.md`, `docs/CLI-SPEC.md`, `docs/REVIEW-LLD-v2.md`.
