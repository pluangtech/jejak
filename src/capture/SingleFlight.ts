import { existsSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { closeSync } from "node:fs";
import { join } from "node:path";
import { localPaths } from "../localstate/paths.js";

/**
 * Flag-and-rerun single-flight (C-4): at most one snapshot per session runs at a time; a request
 * that arrives while one is running sets a rerun marker, and the holder reruns once when it
 * finishes. Caps snapshot pile-up on rapid `Stop` events (upsert CAS still backstops races).
 */
export class SingleFlight {
  private readonly locks: string;
  constructor(repoRoot: string, home?: string) {
    this.locks = localPaths(repoRoot, home).locks;
  }

  private lockFile(id: string): string {
    return join(this.locks, `${id}.lock`);
  }
  private rerunFile(id: string): string {
    return join(this.locks, `${id}.rerun`);
  }

  async run(sessionId: string, task: () => Promise<void>): Promise<void> {
    mkdirSync(this.locks, { recursive: true });
    let fd: number;
    try {
      fd = openSync(this.lockFile(sessionId), "wx"); // exclusive create — fails if held
    } catch {
      writeFileSync(this.rerunFile(sessionId), ""); // busy → ask the holder to rerun
      return;
    }
    try {
      do {
        rmSync(this.rerunFile(sessionId), { force: true });
        await task();
      } while (existsSync(this.rerunFile(sessionId))); // a request arrived during the run
    } finally {
      closeSync(fd);
      rmSync(this.lockFile(sessionId), { force: true });
    }
  }
}
