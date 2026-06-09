# Observability Standardization and jejak: OpenTelemetry, Langfuse, and the Capture Model

> Research note. Status: exploratory (not a design decision). Written 2026-06-09.
> Audience: jejak maintainers weighing whether/when standardization (OpenTelemetry,
> Langfuse, GenAI semantic conventions) should touch jejak's capture format.
>
> TL;DR: jejak and the observability standards are solving **adjacent but different
> problems**. OTel/Langfuse are a *real-time, push-based, vendor-neutral telemetry
> pipeline*; jejak is a *retrospective, git-native, durable record of agent sessions
> bound to the commits they produced*. The standards' **data model maps onto jejak's
> almost cleanly** (session→trace, turn→span, event→log/event, usage→gen_ai.usage),
> which means jejak can stay proprietary internally and still **emit** a standards-
> compliant export later without changing its storage. The interesting fit is not
> "jejak should become OTel" — it's "jejak's stripped event stream is already a
> superset of what an OTel GenAI exporter needs, plus a git anchor the standards lack."

---

## 1. Why this question matters

jejak captures the full session log of an AI coding agent (Claude Code in v0.1), strips
it to an analysis-ready subset, and commits it to a git shadow ref
(`refs/heads/jejak/sessions/v1`) so the *why* behind a diff travels with the code. See
`docs/DESIGN-LLD.md` and `docs/user/concepts/capture.md`.

The whole AI-tooling industry is, at the same time, converging on a way to describe
"what an LLM/agent did" — token usage, tool calls, model, latency, prompts, responses.
That convergence has two anchors:

- **OpenTelemetry (OTel)** — the CNCF-graduated open standard for traces, metrics, and
  logs, now extended with **GenAI semantic conventions** that name the fields of an LLM
  or agent operation.
- **Langfuse** — the most widely adopted open-source *LLM observability product*, whose
  data model (traces / observations / sessions) is itself built on OTel and which can
  ingest raw OTLP.

The question the maintainers should be able to answer: *Does this standardization
threaten, complement, or get absorbed by what jejak does?* This note argues **complement
+ absorb**: jejak already captures a superset of the data these standards describe, and
the standards give jejak a free, vendor-neutral **export surface** if it ever wants one —
without disturbing the git-native core.

jejak has already touched this space once and deferred it on purpose: `docs/REVIEW-LLD-v2.md`
records the decision *not* to adopt ATIF (Agent Trajectory Interchange Format) in v0.1 —
"jejak's stripped schema v1 is specific to the capture-and-replay use case. Adopting ATIF
would force a broader scope. Revisit in v1." The same reasoning frame applies to OTel and
Langfuse and is revisited below.

---

## 2. OpenTelemetry in one page

### 2.1 The three signals

OTel standardizes the **instrumentation, collection, and export** of three telemetry
signals, all carrying correlation IDs so you can pivot between them:

| Signal | What it is | Shape |
|---|---|---|
| **Traces** | The journey of one request across a system | A DAG of **spans** linked by `TraceId` / `SpanId` / `ParentId` |
| **Metrics** | System-wide trends (rates, counts, latencies) | Numeric time series |
| **Logs** | A textual/structured account of an event at a timestamp | **LogRecord**s, optionally tied to a trace |

The unifying primitive is the **span**: a timed unit of work with start/end timestamps,
**attributes** (key–value pairs), **events** (timestamped sub-points inside a span), and a
**context** (`TraceId`, `SpanId`, optional `ParentId`). A trace is a DAG of spans;
parent/child edges define nesting. ([OTel overview](https://opentelemetry.io/docs/specs/otel/overview/),
[spans explained](https://last9.io/blog/opentelemetry-spans-events/))

### 2.2 Logs are deliberately *not* a greenfield API

This is the most important OTel design choice for jejak to understand, because the user's
framing is "how does standardization fit into capturing **logs**."

OTel treats logs differently from traces and metrics. For traces/metrics it defines a new
API you instrument against. **For logs it explicitly does *not* try to replace existing
logging** — it "embraces existing logging solutions" and defines a **data model** that
wraps whatever you already produce, adding correlation fields. The `LogRecord` carries:

- `Timestamp` + `ObservedTimestamp`
- `TraceId` + `SpanId` (so a log line links to the span that emitted it)
- `SeverityNumber` + `Body`
- `Attributes` (structured metadata)
- `Resource` (origin: host, service, app)

The stated rationale: existing logging libraries are richer than anything OTel would
define, and a wholesale replacement is neither practical nor necessary. So OTel logging
is a **compatibility/correlation layer over heterogeneous log formats**, not a single
canonical schema. ([OTel logs spec](https://opentelemetry.io/docs/specs/otel/logs/))

> **Why this matters for jejak:** OTel's own logs philosophy *is jejak's situation*. jejak
> has a rich, domain-specific capture format (`StrippedEvent`) optimized for replay and
> cost analysis. The standards-compliant move is not to discard it for a generic schema —
> it's to keep the rich format and, *if needed*, expose the correlation fields
> (trace/span/timestamp/attributes) on the way out. OTel itself models logs exactly that
> way.

### 2.3 GenAI semantic conventions — the LLM/agent vocabulary

OTel's general model says nothing about LLMs. The **GenAI semantic conventions** fill
that gap with a vendor-neutral vocabulary so dashboards/alerts work across OpenAI,
Anthropic, Cohere, self-hosted, etc. The pieces relevant to an agent like Claude Code:

**GenAI client spans** (one LLM call) — span name `{gen_ai.operation.name} {gen_ai.request.model}`:
([gen-ai spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/))

- `gen_ai.provider.name` — e.g. `anthropic`
- `gen_ai.request.model` / `gen_ai.response.model`
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.response.finish_reasons` — e.g. `stop`, `tool_calls`, `max_tokens`
- `gen_ai.input.messages` / `gen_ai.output.messages` / `gen_ai.system_instructions`
  (content; only captured when content recording is enabled)

**GenAI agent & framework spans** — for agents, not just single calls:
([gen-ai agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/))

- Span types: `create_agent`, `invoke_agent` (client or in-process), `execute_tool`, and
  a `workflow` span that coordinates multiple agents/operations.
- `gen_ai.operation.name` (`invoke_agent` / `create_agent` / `execute_tool`)
- `gen_ai.agent.id` / `gen_ai.agent.name` / `gen_ai.agent.description` / `gen_ai.agent.version`
- `gen_ai.conversation.id` — correlates messages/turns across a stateful interaction
- `gen_ai.tool.name` / `gen_ai.tool.definitions`
- Hierarchy: **workflow span ⊃ agent spans ⊃ tool-execution spans**.

**GenAI events** and **GenAI metrics** exist too (e.g. token-usage metrics), so the same
vocabulary spans all three OTel signals. ([events](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/),
[metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/))

Caveat from the field: these conventions are **still evolving** and not yet stable —
multiple vendors (Datadog, Langfuse) note they map/extend them rather than treating them
as frozen. ([Datadog](https://www.datadoghq.com/blog/llm-otel-semantic-convention/),
[OTel GenAI blog](https://opentelemetry.io/blog/2026/genai-observability/))

---

## 3. Langfuse in one page

Langfuse is an open-source LLM observability platform. Its data model is three nested
concepts, and — critically — **it is built on OpenTelemetry**:
([data model](https://langfuse.com/docs/observability/data-model),
[observation types](https://langfuse.com/docs/observability/features/observation-types))

- **Trace** — one request/operation (e.g. one user question → bot answer). Carries
  `id`, `name`, `user_id`, `session_id`, `tags`, `metadata`, `input`, `output`. Trace-level
  attributes propagate down to its observations. Container of observations.
- **Observation** — a step within a trace, nestable via parent/child. Subtypes:
  - **span** — a generic OTel span (non-LLM work).
  - **generation** — a *specialized span for an LLM call*, adding `model`,
    `model_parameters`, `usage_details` (tokens), `cost_details`, `input`, `output`,
    `metadata`, `level`.
  - **event** — a point-in-time marker.
  - plus tool-call / retrieval types.
- **Session** — optional grouping of traces belonging to one multi-turn interaction.
- **Scores** — evaluations attached to traces/observations (quality signal layer).

Langfuse's own framing is explicit: *"An observation is a Langfuse-specific representation
of an OTel span."* A Langfuse **generation** is just an OTel span with LLM-specific fields.
So Langfuse ≈ **an opinionated, LLM-shaped projection of the OTel data model, plus a
storage/UI/eval product on top.**

### 3.1 Langfuse as an OTel backend (the interop story)

Langfuse exposes an **OTLP ingestion endpoint** (`/api/public/otel`, HTTP/JSON or
HTTP/protobuf; gRPC not yet). Anything that emits OTel GenAI spans — OpenLLMetry,
OpenLIT, MLflow, LiteLLM, framework auto-instrumentation — can ship to Langfuse without a
Langfuse SDK. Langfuse **maps inbound OTel spans to its trace/observation model** and
tolerates the still-evolving GenAI attributes. You can even fan one `TracerProvider` out
to Langfuse *and* another APM backend simultaneously.
([Langfuse OTel](https://langfuse.com/integrations/native/opentelemetry),
[existing OTel setup](https://langfuse.com/faq/all/existing-otel-setup),
[LLMOps multi-language](https://medium.com/@sharanharsoor/opentelemetry-for-llmops-how-langfuse-achieved-universal-multi-language-support-without-building-782d843adf3c))

The lesson Langfuse demonstrates: **you do not have to build N SDKs or invent a format.
Speak OTLP at the boundary and map to your own internal model.** That is the exact pattern
available to jejak.

---

## 4. jejak's capture model (recap, grounded in the code)

From `src/strip/types.ts`, `src/analytics/aggregate.ts`, and `docs/DESIGN-LLD.md`:

- **Unit of capture = a session** — one Claude Code session, from `SessionStart` to
  `SessionEnd`, identified by `session_id`.
- **Events** — each transcript line becomes a `StrippedEvent`:
  `id`, `parentId`, `type`, `timestamp`, `role`, `model`, `usage`, `stopReason`,
  `requestId`, `durationMs`, `isSidechain`, `isMeta`, `content[]` (blocks), `text`, `meta`.
- **Usage** — normalized token economics: `inputTokens`, `outputTokens`,
  `cacheCreation{5m,1h}Tokens`, `cacheReadTokens`, `serviceTier`, `inferenceGeo`, `speed`,
  `webSearchRequests`, `webFetchRequests`.
- **Content blocks** — `text` / `thinking` / `tool_use` / `tool_result`, with large
  payloads **content-addressed** to git blobs (`sha`, `bytes`, `preview`) and only a
  preview kept inline.
- **Session metadata** (`meta.json`) — `session_id`, `agent`, `dev_handle`, `status`,
  `event_count`, `turn_count`, `started_at`/`ended_at`, `duration_ms`, `models[]`,
  `tokens{}`, `web_tool_use{}`, `cost_usd`, `pricing_version`, `commit_sha`, `redactions[]`.
- **Storage** — gzipped `events.jsonl.gz` + `meta.json`, sharded per developer handle,
  under the orphan shadow ref; written via git plumbing (`read-tree` → `update-index` →
  `write-tree` → `commit-tree` → CAS `update-ref`); merged client-side with
  `git merge-tree` over disjoint per-handle subtrees.
- **The git anchor** — sessions link to the commits they produced via `Jejak-Session:`
  commit trailers (`jejak link <sha>`).

---

## 5. The mapping: jejak ↔ OTel/Langfuse

The structures line up far more than the v0.1 "we don't use OTel" stance suggests. Almost
every jejak field has a named counterpart in the standards.

| Concept | jejak | OpenTelemetry (GenAI) | Langfuse |
|---|---|---|---|
| Top-level work unit | **Session** (`session_id`) | Trace + `gen_ai.conversation.id` | **Trace** (often grouped under a **Session**) |
| One agent reasoning cycle | **Turn** (`requestId`) | `invoke_agent` / client span | **Observation** (span) |
| One LLM call | assistant `StrippedEvent` w/ `model`+`usage` | GenAI **client span** | **generation** |
| Tool call | `tool_use` / `tool_result` block (`toolUseId`) | `execute_tool` span | tool-call observation |
| One transcript line | **`StrippedEvent`** | LogRecord / span event | **event** observation |
| Parent/child | `parentId` | `ParentId` / span tree | observation `parent` |
| Timestamps | `timestamp`, `started_at`/`ended_at`, `durationMs` | span start/end | observation/trace times |
| Model | `model`, `models[]` | `gen_ai.request.model` / `gen_ai.response.model` | `model` |
| Token usage | `usage.{input,output,cache*,...}` | `gen_ai.usage.{input,output}_tokens` | `usage_details` |
| Cost | `cost_usd` (derived, versioned pricing) | *(not built-in; consumer derives)* | `cost_details` (first-class) |
| Stop reason | `stopReason` | `gen_ai.response.finish_reasons` | (metadata) |
| Provider/agent identity | `agent` (`claude-code`) | `gen_ai.provider.name`, `gen_ai.agent.*` | trace `name`/`metadata` |
| Free-form attributes | `meta` catch-all | span `Attributes` | `metadata` |
| Actor | `dev_handle` | resource / custom attr | `user_id` |
| **Code anchor** | **`Jejak-Session` trailer / `commit_sha`** | **— (no native git link)** | **— (no native git link)** |
| Quality/eval | *(none in v0.1)* | *(separate)* | **Scores** (first-class) |
| Bulk-payload offload | content-addressed git blobs (`sha`/`preview`) | *(not addressed)* | truncation/media handling |

Three things fall out of this table.

**(a) jejak is a near-superset of the GenAI span data, not a competitor to it.** Token
breakdown (cache 5m/1h, inference geo, fast-mode), per-turn cost from a *versioned* pricing
table, and full verbatim thinking are *richer* than what the GenAI conventions currently
standardize. Where OTel says "consumer derives cost," jejak ships cost. Where Langfuse has
`usage_details`, jejak has a more granular `usage`.

**(b) The two columns the standards own and jejak lacks are *Scores/eval* and a
*real-time pipeline*.** Langfuse's scores (and OTel's metrics) are a quality-signal layer
jejak doesn't model yet. And OTel/Langfuse are push-at-runtime; jejak is capture-after.

**(c) The one column jejak owns that *neither* standard has is the git anchor.** Binding a
session to the commit SHA it produced — and surviving rebases via the orphan shadow ref —
is jejak's differentiator. No OTel/Langfuse concept ties a trace to a durable VCS object.
This is the "footprint in the repo, forever" property that the cloud-telemetry model
structurally cannot provide (their traces live in a backend with a retention window).

---

## 6. Where the models genuinely diverge (the fit's edges)

Standardization is not free, and the fit is not total. The real differences:

1. **Push/real-time vs. capture/retrospective.** OTel/Langfuse instrument a *running*
   process and stream telemetry to a backend. jejak reads a *finished* transcript file and
   commits it. jejak is closer in spirit to **OTel logs** (wrap an existing record format,
   add correlation) than to **OTel tracing** (live instrumentation). This is why, if jejak
   ever speaks OTel, the natural shape is an **offline OTLP exporter / batch span builder**,
   not in-process SDK instrumentation.

2. **Durability model.** Shadow-ref-in-git = permanent, distributed, versioned, offline,
   no server. Collector→backend = operational, queryable in real time, retention-bounded,
   needs infrastructure. These are complementary, not substitutes.

3. **Privacy posture.** jejak hard-gates `push` on a PII catalog and records `redactions[]`;
   thinking is kept in full locally but can be stripped. The OTel GenAI conventions make
   prompt/response **content** opt-in precisely because it's sensitive — same instinct,
   different enforcement point (jejak enforces at the git boundary, OTel at the
   instrumentation boundary).

4. **Scope creep risk.** This is the v0.1 ATIF argument, verbatim
   (`docs/REVIEW-LLD-v2.md`): adopting a generic interchange format "would force a broader
   scope." Mapping to OTel GenAI today means binding to an **unstable, still-evolving**
   spec. That's a real cost and the reason to *map at the boundary later*, not to
   *restructure the internal schema now*.

5. **Granularity mismatch.** jejak's `StrippedEvent` is line-grained (one transcript line);
   OTel's span is operation-grained (one LLM call / one tool exec). An exporter has to
   *fold* jejak events into spans (group the assistant turn + its tool_use/tool_result into
   one client span with child `execute_tool` spans). The data is all present (`requestId`,
   `parentId`, `toolUseId`) — it's a transformation, not a data gap.

---

## 7. How standardization could fit jejak — three concrete postures

These are options, ordered by cost, not recommendations. v0.1's "no OTel" stance remains
correct; this is about v1+.

### Posture A — Stay proprietary, add a one-way OTel/Langfuse **exporter** (lowest cost, highest leverage)

Add `jejak export --format otlp` (or `--format langfuse`) that reads stripped sessions and
emits OTel GenAI spans:

- Session → trace, with `gen_ai.conversation.id = session_id`, `gen_ai.agent.name = agent`.
- Each turn (`requestId`) → an `invoke_agent` / client span carrying
  `gen_ai.request.model`, `gen_ai.usage.*`, `gen_ai.response.finish_reasons`.
- Each `tool_use`/`tool_result` → a child `execute_tool` span (`gen_ai.tool.name`).
- Token usage maps to `gen_ai.usage.*`; cost rides as a custom `jejak.cost_usd` attribute
  (OTel doesn't standardize cost). The git anchor rides as a custom `jejak.commit_sha`.

Because **Langfuse ingests raw OTLP**, this single exporter gets you Langfuse, Datadog,
Grafana, Honeycomp, etc., for free — the "speak OTLP at the boundary" pattern Langfuse
itself proved. jejak's storage, schema, and git-native core are untouched. This is the
highest-leverage option: standardization becomes an *output adapter*, not a rewrite.

### Posture B — Adopt OTel GenAI attribute *names* inside `StrippedEvent` (medium cost)

Rename/align fields so the internal schema already uses standardized keys
(`gen_ai.usage.input_tokens` etc.), making the exporter trivial and the format
self-documenting. Cost: churns the schema and binds it to a spec that's still moving. Likely
**not worth it** until the GenAI conventions stabilize — but worth re-checking each release.

### Posture C — Become an OTel-native capture backend (highest cost, probably wrong)

Re-architect capture around the OTel SDK / OTLP ingestion. This fights jejak's nature:
it's batch-from-transcript, not live-instrumented, and its value is the git anchor, not a
telemetry pipeline. **Not recommended.** Listed for completeness.

**Default recommendation:** keep v0.1 as-is; pencil **Posture A** in for v1 as the way to
satisfy "interop" — it's the move that costs jejak nothing structurally and inherits the
entire OTel/Langfuse ecosystem through one adapter. Revisit Posture B only once the GenAI
semantic conventions are declared stable.

---

## 8. Direct answer to the question

**"How does this type of standardization fit into the logs jejak captures?"**

- **Conceptually, the fit is clean.** jejak's session/turn/event/usage model is a
  domain-specific instance of exactly what OTel GenAI and Langfuse standardize. A session
  is a trace, a turn is a span, an event is a log/event, `usage` is `gen_ai.usage`. Nothing
  in jejak's capture is *incompatible* with the standards; most of it is a *richer superset*.

- **The right mental model is OTel *logs*, not OTel *tracing*.** OTel deliberately does
  **not** force one canonical log schema — it wraps existing rich formats and adds
  correlation fields. jejak's relationship to the standards should be identical: keep the
  rich `StrippedEvent` format, expose correlation/standard fields **at export time**.

- **Standardization is an *export surface*, not a storage decision.** Langfuse proved you
  can keep your own internal model and still ingest/emit OTLP at the boundary. jejak should
  do the same: one OTLP/Langfuse exporter (Posture A) buys the whole ecosystem without
  touching the git-native core.

- **jejak has one thing the standards structurally lack: the durable git anchor.** OTel and
  Langfuse traces live in a retention-bounded backend and have no native tie to the commit
  they produced. jejak's `Jejak-Session` trailer + orphan shadow ref make the record
  permanent, distributed, and bound to the code. That's not something to standardize away —
  it's the differentiator the standards would carry as a custom attribute on export.

- **v0.1's "don't adopt a standard yet" call is sound** (same logic as the ATIF deferral),
  because the GenAI conventions are still evolving. The cost-free path is to *map at the
  boundary later*, never to restructure the internal schema now.

---

## Sources

OpenTelemetry:
- [OTel specification overview](https://opentelemetry.io/docs/specs/otel/overview/)
- [OTel logs data model](https://opentelemetry.io/docs/specs/otel/logs/)
- [GenAI client spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [GenAI agent & framework spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [GenAI events](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/)
- [GenAI metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [Inside the LLM Call: GenAI Observability with OTel](https://opentelemetry.io/blog/2026/genai-observability/)
- [Spans & events explained (Last9)](https://last9.io/blog/opentelemetry-spans-events/)
- [Datadog supports OTel GenAI semantic conventions](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)

Langfuse:
- [Langfuse data model](https://langfuse.com/docs/observability/data-model)
- [Observation types](https://langfuse.com/docs/observability/features/observation-types)
- [Sessions](https://langfuse.com/docs/observability/features/sessions)
- [OpenTelemetry (OTEL) for LLM observability](https://langfuse.com/integrations/native/opentelemetry)
- [Integrating with an existing OTel setup](https://langfuse.com/faq/all/existing-otel-setup)
- [How Langfuse achieved multi-language support via OTel (Medium)](https://medium.com/@sharanharsoor/opentelemetry-for-llmops-how-langfuse-achieved-universal-multi-language-support-without-building-782d843adf3c)

jejak (this repo):
- `docs/DESIGN-LLD.md`, `docs/CLI-SPEC.md`, `docs/REVIEW-LLD-v2.md` (ATIF deferral)
- `src/strip/types.ts` (`StrippedEvent`, `StrippedBlock`, `Usage`)
- `src/analytics/aggregate.ts` (`SessionMeta`)
- `docs/user/concepts/shadow-branch.md`, `docs/user/concepts/capture.md`
