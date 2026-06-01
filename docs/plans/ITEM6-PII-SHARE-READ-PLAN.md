# Item 6 — PII gate, sharing, and read CLI (implementation plan)

## Context

Item 5 captures sessions to the **local** shadow ref with a `NoopPiiScanner` seam. Item 6 makes
traces **safe to share** (fill the PII seam) and **usable** (`log`/`show`/`link`/`status`), then
**shareable** (`push`/`fetch`) and **maintainable** (`attach`/`uninstall`/full `doctor`). This is the
last big v0.1 item — every remaining stub verb goes live. The read CLI is where the captured
tokens/cost/turns/duration analytics finally become queryable (the project's coaching/remuneration goal).

- **Tracks:** [IMPLEMENTATION-ORDER §6](../IMPLEMENTATION-ORDER.md) · **Design:** DESIGN-LLD §9 (PII), §12 (merge), §15 (push/fetch), §16 (read path + doctor + attach + uninstall).
- **Decisions (this plan):** (1) PII **redacts inline and keeps the session** (mark `captured-with-blocks`), never silently drops it; (2) custom patterns via a zero-dep **`.jejak/pii.json`** (built-ins always on) — deviates from the doc's `.yaml` to avoid a YAML dep.

### Phasing (ship in order; each is independently valuable + validated)

| Phase | Scope | Why first |
|---|---|---|
| **6a — PII gate** | Real `CatalogPiiScanner` (6 built-in block patterns + `.jejak/pii.json` override) filling the seam; redact-inline; `doctor` "PII ready" | Safety-critical; unblocks push; small |
| **6b — Read CLI** | `jejak log` (analytics table from meta.json), `show` (+`--expand`), `link`, `status` | Turns captured data into value |
| **6c — Sharing** | `push`/`fetch` with client-side merge (§12), PII hard-gate | The git-heavy part |
| **6d — Lifecycle** | `attach` (3-branch link), `uninstall` (+`--purge`), full `doctor`/`--trace` | Rounds out v0.1 |

---

## 1. Design patterns
| Pattern | Applied to |
|---|---|
| **Strategy** (existing seam) | `PiiScanner` → `CatalogPiiScanner` replaces `NoopPiiScanner` |
| **Adapter + Registry** | PII pattern sources: built-in catalog + `.jejak/pii.json` loader |
| **Repository** | `SessionReader` (read shadow ref), `SyncRepository` (fetch/merge/push) over `GitClient` |
| **Command (module-per-verb)** | graduate `log`/`show`/`link`/`status`/`push`/`fetch`/`attach`/`uninstall` to `*.command.ts` |
| **Facade** | new `GitClient` methods (lsTree, logBody, revListCount, fetch, push, merge) — one git seam |
| **DI** | scanner/git/reader injected; units use fakes (no real remote/Claude) |

---

## 2. Phase 6a — PII gate (`src/pii/`)

- **`PiiScanner` interface change:** `scan(content) → { scrubbed: string; findings: Finding[] }` where
  `Finding = { type: string; count: number; severity: "block" | "warn" }`. (Drops the old `blocked`
  boolean — we always write the scrubbed text; presence of `block` findings just flags the session.)
- **`patterns.ts`** — the 6 built-in block patterns (AWS keys, GCP SA key, `Authorization: Bearer`,
  SSH private key, `SECRET|TOKEN|KEY|PASSWORD|API_KEY=…`, JWT) per DESIGN-LLD §9, each `block`
  severity; email as a `warn` pattern (opt-in, off by default).
- **`CatalogPiiScanner.ts`** — apply each pattern; replace matches with `[REDACTED-<type>]`; tally
  findings. Returns scrubbed text + findings.
- **`loadCatalog.ts`** — built-ins + optional `.jejak/pii.json` (`{ patterns: [{name, regex, severity}],
  redactEmail?: bool }`), zero-dep `JSON.parse`; bad file → log + fall back to built-ins (fail-safe).
- **Wire-in:** `createCaptureContext` injects `CatalogPiiScanner` (loaded from `repoRoot`'s pii.json)
  instead of `NoopPiiScanner`. **SnapshotWorker:** always upsert `scan.scrubbed`; if `findings`
  has any `block`-severity entry → `setStatus(captured-with-blocks)` and record the finding types in
  `meta` (count per type, no values). *(Refines 5b's blocked branch: redact-and-keep, not skip.)*
- **doctor:** "PII ready" = catalog loaded (always true with built-ins; false only on an unparseable pii.json).

## 3. Phase 6b — Read CLI (`src/read/` + command modules)

- **`SessionReader.ts`** (Repository over `GitClient`): `list(handle?)` → `[{ handle, sessionId, meta }]`
  (ls-tree `sessions/`, cat-file each `meta.json`); `events(handle, id)` → `StrippedEvent[]` (gunzip);
  `payload(sha)` → bytes (cat-file `payloads/<sha>`).
- **`jejak log`** `[--handle <h>] [--json]` — table: session, status, started, turns, in/out/cache tokens,
  **cost_usd**, model. The analytics payoff. (Default: this dev's handle; `--all` later.)
- **`jejak show <session-id>`** `[--expand] [--json]` — print the stripped events (previews shown by
  default; `--expand` resolves `sha` → payload blob for full content).
- **`jejak link <sha>`** `[--json]` — `git log -1 --format=%B <sha>` → parse all `Jejak-Session:` trailers
  (index fallback later); print session ids (DESIGN-LLD §10.5/§16.1).
- **`jejak status`** — shadow ref local vs `origin` ahead/behind (`git rev-list --count`); "not pushed yet" if no remote ref.
- **`GitClient` additions:** `lsTree(ref, path, {recursive})`, `logBody(sha)`, `revListCount(range)`.

## 4. Phase 6c — Sharing (`src/sync/`)

- **`SyncRepository`** over `GitClient`: `fetch` origin shadow ref → **client-side 3-way merge** (§12)
  honoring the seed `.gitattributes` (`sessions/** merge=ours`, `index/**/by-commit.ndjson merge=union`)
  → `push` with retry loop (plain `git push`, re-fetch+merge on rejection).
- **`GitClient` additions:** `fetch(remote, ref)`, `push(remote, ref)`, and a merge via
  **`git merge-tree --write-tree <base> <ours> <theirs>`** → tree → parented `commit-tree` → CAS
  `update-ref`. Use `merge-tree` (not bare `read-tree -m`): it actually runs the `merge=ours` /
  `merge=union` drivers from the merged trees' `.gitattributes` (REVIEW-LLD C-3 — `read-tree -m`
  alone does index-level 3-way and does **not** invoke the drivers, the "paper invariant" trap).
  Driver registered at init (`merge.ours.driver true`). Never checks out the ref.
- **`jejak push` / `jejak fetch`** command modules. **PII hard-gate:** `push` refuses if the catalog
  failed to load (the only "uninitialized" case with built-ins). Merge is conflict-free by construction
  (disjoint `sessions/<handle>/…` partitions + union index).

## 5. Phase 6d — Lifecycle

- **`jejak attach <session-id> [--force]`** — strip→PII→shadow write, then the **three-branch commit
  link** (§16.4): HEAD already has trailers → append; HEAD has none → prompt to amend (`--force` skips);
  not a repo/detached → shadow-only, `commit_sha=null` (unlinked).
- **`jejak uninstall [--purge]`** — inverse of setup: remove jejak's hook entries from
  `.claude/settings.json` (keep foreign hooks), remove the `prepare-commit-msg` git hook **if it's ours**;
  `--purge` also `rm -rf ~/.jejak/<repo-hash>/`. Shadow ref untouched; re-`setup` restores cleanly.
- **Full `doctor`** — extend the minimal checks with: stale open sessions (>1h → `attach` hint),
  dispatch errors (7d), shadow sync ahead/behind, orphan locks, PII-ready, fs warnings (NFS/iCloud),
  staging orphans. **`doctor --trace`** reads `dispatch.log` hook timings → per-hook p50/p95/p99, flag p95>50ms.

---

## 6. Module layout (new / changed)
```
src/pii/        patterns.ts · CatalogPiiScanner.ts · loadCatalog.ts  (PiiScanner iface updated)
src/read/       SessionReader.ts
src/sync/       SyncRepository.ts
src/git/GitClient.ts   + lsTree, logBody, revListCount, fetch, push, merge
src/commands/   log/show/link/status/push/fetch/attach/uninstall.command.ts (graduate from stubs)
src/doctor.ts   + full checks; src/doctor/trace.ts (dispatch-log percentiles)
src/capture/SnapshotWorker.ts + hooks/CaptureContext.ts  (real scanner; redact-and-keep)
```

## 7. Testing
- **PII (unit):** each of the 6 patterns redacts to `[REDACTED-<type>]`; email only when opted in;
  findings tally; `.jejak/pii.json` adds a custom pattern; unparseable pii.json → built-ins + logged;
  worker marks `captured-with-blocks` on a block finding **and still writes scrubbed** (no secret on the ref).
- **Read (real-git temp repo):** seed sessions via `_dev write-fixture`; `log` shows analytics rows;
  `show` prints events + `--expand` resolves a payload; `link` finds trailers on a real commit; `status` ahead/behind.
- **Sharing (two temp repos / a bare remote):** push → fetch in a second clone → identical ref;
  concurrent writes from two handles → conflict-free merge (both sessions present); push retry on rejection;
  **`push` with an unloadable `pii.json` refuses with a non-zero exit (assert the code)** — the hard gate.
- **Lifecycle:** `attach` three branches; `uninstall` removes only jejak hooks (foreign preserved) + `--purge`;
  full `doctor` flags a stale session / unlinked session; `--trace` percentiles from a synthetic dispatch log.
- `pnpm test`/`lint`/`typecheck`/`docs:gen` green. No new deps (zero-dep pii.json).

## 8. Doc reconciliation
CLI-SPEC (all remaining verbs → shipped; PII redact-and-keep + `.jejak/pii.json` noted) · DESIGN-LLD
§9 (redact-inline refinement + pii.json), §16 (module names) · IMPLEMENTATION-ORDER §6 (tick per phase,
status `done` at end) · `docs/user/` pages for `log`/`show`/`push` + a "sharing & privacy" concept
(bound `sources_hash`). After item 6: **v0.1 feature-complete → dogfood.**

## 9. Deferred (post-v0.1)
Index `by-commit.ndjson` accelerator (trailers are authoritative) · two-tier storage (Δ-2 Path B) ·
pre-turn diff · Cursor adapter · `jejak digest`/`replay` · richer pii.yaml + full security audit.
