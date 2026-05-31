import { spawn } from "node:child_process";

export interface SpawnOptions {
  final?: boolean;
}

/** Launches the detached snapshot worker. Injectable so tests can run it synchronously. */
export interface WorkerSpawner {
  spawn(sessionId: string, opts?: SpawnOptions): void;
}

/**
 * Detached spawn of `jejak _worker` (LESSONS §3): `start_new_session` + `stdio:ignore` + `.unref()`
 * so the worker survives the hook's exit and the hook returns immediately (<50 ms).
 */
export class DetachedWorkerSpawner implements WorkerSpawner {
  spawn(sessionId: string, opts?: SpawnOptions): void {
    const cli = process.argv[1];
    if (!cli) return; // can't locate the CLI — fail-open (no capture, no crash)
    const args = [cli, "_worker", "--session", sessionId];
    if (opts?.final) args.push("--final");
    const child = spawn(process.execPath, args, { detached: true, stdio: "ignore" });
    child.unref();
  }
}
