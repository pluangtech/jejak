import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { SCHEMA, type SessionRow, type SessionStatus } from "./schema.js";

/**
 * Per-repo session state (SQLite, `~/.jejak/<repo-hash>/ledger.db`). Repository over the
 * `sessions` table; the only place capture touches session lifecycle. Pass `:memory:` in tests.
 */
export class SessionLedger {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  /** Open a new session, or resume an existing one (any status → open), keeping its offset. */
  openOrResume(
    sessionId: string,
    transcriptPath: string | null,
    now: string,
  ): { resumed: boolean } {
    if (this.get(sessionId)) {
      this.db
        .prepare(
          "UPDATE sessions SET status='open', transcript_path=COALESCE(?, transcript_path) WHERE session_id=?",
        )
        .run(transcriptPath, sessionId);
      return { resumed: true };
    }
    this.db
      .prepare(
        "INSERT INTO sessions (session_id, status, transcript_path, started_at) VALUES (?, 'open', ?, ?)",
      )
      .run(sessionId, transcriptPath, now);
    return { resumed: false };
  }

  get(sessionId: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE session_id=?").get(sessionId) as
      | SessionRow
      | undefined;
  }

  /** Record progress through the transcript. Advanced even on a blocked snapshot (LESSONS §4.6). */
  advanceOffset(sessionId: string, offset: number, eventCount: number): void {
    this.db
      .prepare("UPDATE sessions SET last_offset=?, event_count=? WHERE session_id=?")
      .run(offset, eventCount, sessionId);
  }

  setStatus(
    sessionId: string,
    status: SessionStatus,
    fields?: { commitSha?: string; branch?: string; endedAt?: string },
  ): void {
    this.db
      .prepare(
        "UPDATE sessions SET status=?, commit_sha=COALESCE(?, commit_sha), branch=COALESCE(?, branch), ended_at=COALESCE(?, ended_at) WHERE session_id=?",
      )
      .run(
        status,
        fields?.commitSha ?? null,
        fields?.branch ?? null,
        fields?.endedAt ?? null,
        sessionId,
      );
  }

  /** Open session ids, oldest first (the order prepare-commit-msg stamps trailers). */
  listOpen(): string[] {
    const rows = this.db
      .prepare("SELECT session_id FROM sessions WHERE status='open' ORDER BY started_at")
      .all() as {
      session_id: string;
    }[];
    return rows.map((r) => r.session_id);
  }

  /** Full rows for every open session, oldest first (for `jejak doctor` staleness checks). */
  openRows(): SessionRow[] {
    return this.db
      .prepare("SELECT * FROM sessions WHERE status='open' ORDER BY started_at")
      .all() as SessionRow[];
  }

  /** Most recently started open session (for `jejak active-session-id`). */
  mostRecentOpen(): string | null {
    const row = this.db
      .prepare(
        "SELECT session_id FROM sessions WHERE status='open' ORDER BY started_at DESC LIMIT 1",
      )
      .get() as { session_id: string } | undefined;
    return row?.session_id ?? null;
  }

  close(): void {
    this.db.close();
  }
}
