import type { GitClient } from "../git/GitClient.js";
import { resolveDevHandle } from "../handle/HandleResolver.js";
import type { SessionLedger } from "../ledger/SessionLedger.js";
import type { PiiScanner } from "../pii/PiiScanner.js";
import { GitBlobPayloadSink } from "../shadow/GitBlobPayloadSink.js";
import type { ShadowRepository } from "../shadow/ShadowRepository.js";
import { stripTranscript } from "../strip/Stripper.js";
import { readerFor } from "../strip/transcript/registry.js";
import type { StrippedEvent } from "../strip/types.js";
import type { StagingStore } from "./StagingStore.js";

export interface SnapshotWorkerDeps {
  git: GitClient;
  ledger: SessionLedger;
  staging: StagingStore;
  scanner: PiiScanner;
  shadow: ShadowRepository;
  /** ISO timestamp source (injected for determinism). */
  now: () => string;
}

/**
 * The capture pipeline: strip the transcript delta (from the ledger offset) → append to staging →
 * PII-scan → upsert the full staged narrative to the shadow ref → advance the offset. Reuses
 * items 3 (`stripTranscript`) and 4 (`ShadowRepository.upsert`, `GitBlobPayloadSink`).
 */
export class SnapshotWorker {
  constructor(private readonly deps: SnapshotWorkerDeps) {}

  async run(sessionId: string, opts?: { final?: boolean }): Promise<void> {
    const row = this.deps.ledger.get(sessionId);
    if (!row || !row.transcript_path) return; // unknown session / nothing to read

    const handle = await resolveDevHandle({ git: this.deps.git });
    const sink = new GitBlobPayloadSink(this.deps.git);

    // 1. strip the delta since the last processed offset; track the new offset
    const delta: string[] = [];
    let offset = row.last_offset;
    for await (const event of stripTranscript(readerFor("claude-code"), row.transcript_path, {
      fromOffset: row.last_offset,
      sink,
      onProgress: (o) => {
        offset = o;
      },
    }) as AsyncIterable<StrippedEvent>) {
      delta.push(JSON.stringify(event));
    }

    // 2. accumulate in staging; the shadow ref always holds the full session-so-far
    this.deps.staging.appendEvents(sessionId, delta);
    const eventsJsonl = this.deps.staging.read(sessionId);
    const eventCount = this.deps.staging.eventCount(sessionId);

    // 3. PII gate (best-effort; Noop in item 5 → never blocks)
    const scan = this.deps.scanner.scan(eventsJsonl);

    // Offset advances regardless (LESSONS §4.6 — never re-fail the same bytes).
    if (scan.blocked) {
      this.deps.ledger.advanceOffset(sessionId, offset, eventCount);
      this.deps.ledger.setStatus(
        sessionId,
        "captured-with-blocks",
        opts?.final ? { endedAt: this.deps.now() } : undefined,
      );
      return; // do NOT write blocked content to the shared ref
    }

    const meta: Record<string, unknown> = {
      v: 1,
      session_id: sessionId,
      agent: "claude-code",
      dev_handle: handle,
      event_count: eventCount,
      status: opts?.final ? "captured" : "open",
    };
    let commitSha: string | undefined;
    if (opts?.final) {
      commitSha = (await this.deps.git.findCommitWithTrailer(sessionId)) ?? undefined;
      if (commitSha) meta.commit_sha = commitSha;
    }

    await this.deps.shadow.upsert({
      handle,
      sessionId,
      eventsJsonl: scan.scrubbed,
      meta,
      payloadEntries: sink.entries,
    });
    this.deps.ledger.advanceOffset(sessionId, offset, eventCount);

    if (opts?.final) {
      this.deps.ledger.setStatus(sessionId, "captured", { commitSha, endedAt: this.deps.now() });
      this.deps.staging.clear(sessionId); // success → drop the local scratchpad (C-4)
    }
  }
}
