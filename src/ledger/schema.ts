/** Session lifecycle status (DESIGN-LLD §11/§14). */
export type SessionStatus = "open" | "captured" | "captured-with-blocks" | "failed";

export interface SessionRow {
  session_id: string;
  status: SessionStatus;
  transcript_path: string | null;
  /** Byte offset of the transcript already processed (resume point). */
  last_offset: number;
  started_at: string | null;
  ended_at: string | null;
  commit_sha: string | null;
  branch: string | null;
  event_count: number;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id      TEXT PRIMARY KEY,
  status          TEXT NOT NULL,
  transcript_path TEXT,
  last_offset     INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT,
  ended_at        TEXT,
  commit_sha      TEXT,
  branch          TEXT,
  event_count     INTEGER NOT NULL DEFAULT 0
);
`;
