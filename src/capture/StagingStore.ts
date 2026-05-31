import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { localPaths } from "../localstate/paths.js";

/**
 * Per-session local scratchpad at `~/.jejak/<hash>/staging/<session>/events.jsonl` — accumulates
 * stripped events across snapshots before the shadow-ref write (Δ-2 Path A). Never pushed.
 */
export class StagingStore {
  private readonly base: string;
  constructor(repoRoot: string, home?: string) {
    this.base = localPaths(repoRoot, home).staging;
  }

  private file(sessionId: string): string {
    return join(this.base, sessionId, "events.jsonl");
  }

  /** Append delta event lines (canonical JSONL — one newline-terminated object per line). */
  appendEvents(sessionId: string, lines: string[]): void {
    if (lines.length === 0) return;
    mkdirSync(join(this.base, sessionId), { recursive: true });
    appendFileSync(this.file(sessionId), `${lines.join("\n")}\n`, "utf8");
  }

  /** Full accumulated narrative for the session (empty string if none yet). */
  read(sessionId: string): string {
    const f = this.file(sessionId);
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  }

  eventCount(sessionId: string): number {
    const content = this.read(sessionId).trimEnd();
    return content.length === 0 ? 0 : content.split("\n").length;
  }

  clear(sessionId: string): void {
    rmSync(join(this.base, sessionId), { recursive: true, force: true });
  }
}
