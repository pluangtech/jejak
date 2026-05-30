/** Shared interfaces — expanded in items 3–6. */

export interface StrippedEvent {
  id: string;
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SessionMeta {
  sessionId: string;
  agent?: string;
  startedAt?: string;
  [key: string]: unknown;
}

export interface HookPayload {
  sessionId?: string;
  cwd?: string;
  [key: string]: unknown;
}
