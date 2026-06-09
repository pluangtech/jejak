import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Reporter } from "./app/AppDeps.js";
import {
  AGENT_HOOKS,
  HOOK_P95_BUDGET_MS,
  parseDispatchLog,
  summarizeDispatch,
} from "./doctor/dispatch.js";
import type { GitClient } from "./git/GitClient.js";
import { PRE_PUSH_MARKER } from "./git/pushGuard.js";
import { isDisabled } from "./hooks/disabled.js";
import { SessionLedger } from "./ledger/SessionLedger.js";
import { localPaths } from "./localstate/paths.js";
import { loadCatalog } from "./pii/loadCatalog.js";
import { resolveHooksDir } from "./setup/hooksDir.js";
import { SHADOW_REF } from "./shadow/constants.js";

export interface DoctorDeps {
  repoRoot: string;
  reporter: Reporter;
  /** Git seam — when present, doctor reports shadow sync ahead/behind. */
  git?: GitClient;
  /** Print per-hook latency percentiles from the dispatch log. */
  trace?: boolean;
  /** Clock (tests). */
  now?: () => Date;
  /** Home dir override (tests). */
  home?: string;
}

const ORIGIN_REF = "refs/remotes/origin/jejak/sessions/v1";
const STALE_MS = 60 * 60 * 1000; // an open session idle > 1h is likely abandoned
const FS_MARKERS = ["/Library/CloudStorage", "/Dropbox", "/Google Drive", "/.nfs"];

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * `jejak doctor` — setup checks plus capture-health diagnostics (DESIGN-LLD §16.2): shadow sync,
 * stale open sessions, dispatch errors, orphan locks/staging, filesystem warnings. `--trace` adds
 * per-hook latency percentiles. Returns `{ ok }` (setup checks only) for tests.
 */
export async function runDoctor(deps: DoctorDeps): Promise<{ ok: boolean }> {
  const { repoRoot, reporter } = deps;
  const now = deps.now ?? (() => new Date());
  const lp = localPaths(repoRoot, deps.home);

  const settingsPath = join(repoRoot, ".claude", "settings.json");
  const agentWired = existsSync(settingsPath) && safeRead(settingsPath).includes("_hook ");
  // Honor core.hooksPath (husky) when git is available; otherwise fall back to .git/hooks.
  const hooksDir = deps.git
    ? await resolveHooksDir(deps.git, repoRoot)
    : join(repoRoot, ".git", "hooks");
  const gitHookPath = join(hooksDir, "prepare-commit-msg");
  const gitHookWired =
    existsSync(gitHookPath) && safeRead(gitHookPath).includes("_hook prepare-commit-msg");
  const prePushPath = join(hooksDir, "pre-push");
  const prePushWired = existsSync(prePushPath) && safeRead(prePushPath).includes(PRE_PUSH_MARKER);

  const checks: Array<{ name: string; ok: boolean }> = [
    { name: "agent hooks in .claude/settings.json", ok: agentWired },
    { name: "git hook prepare-commit-msg", ok: gitHookWired },
    { name: "pre-push shadow guard (accidental-push protection)", ok: prePushWired },
    { name: "session ledger present", ok: existsSync(lp.ledgerDb) },
    { name: "PII catalog ready (push gate)", ok: loadCatalog(repoRoot).ok },
  ];

  reporter.line("jejak doctor — setup checks:");
  for (const c of checks) reporter.line(`  [${c.ok ? "ok" : "MISSING"}] ${c.name}`);
  if (!prePushWired) {
    reporter.line(
      "  [warn] shadow ref NOT protected from accidental `git push` — run `jejak setup`",
    );
  }
  reporter.line(
    `  [info] .jejak/disabled: ${isDisabled(repoRoot) ? "present (capture OFF)" : "absent"}`,
  );

  await reportSync(deps);
  await reportPushSafety(deps);
  reportSessionsAndState(deps, lp, now());
  reportFilesystem(deps);
  if (deps.trace) reportTrace(deps, lp);

  reporter.flush();
  return { ok: checks.every((c) => c.ok) };
}

/** Shadow ref local vs origin (mirrors `runStatus`). */
async function reportSync(deps: DoctorDeps): Promise<void> {
  const { git, reporter } = deps;
  if (!git) return;
  if (!(await git.refExists(SHADOW_REF))) {
    reporter.line("  [info] shadow ref: not initialized");
    return;
  }
  if (await git.refExists(ORIGIN_REF)) {
    const ahead = await git.revListCount(`${ORIGIN_REF}..${SHADOW_REF}`);
    const behind = await git.revListCount(`${SHADOW_REF}..${ORIGIN_REF}`);
    reporter.line(`  [info] shadow sync: ${ahead} ahead, ${behind} behind origin`);
  } else {
    reporter.line("  [info] shadow sync: not pushed yet (no origin tracking ref)");
  }
}

/** Warn on git config that lets a plain `git push` carry the shadow ref past the guard's intent. */
async function reportPushSafety(deps: DoctorDeps): Promise<void> {
  const { git, reporter } = deps;
  if (!git) return;
  if ((await git.getConfig("push.default")) === "matching") {
    reporter.line(
      "  [warn] push.default=matching — a plain `git push` can carry the trace ref; prefer 'simple' (the guard still blocks it)",
    );
  }
}

/** Stale open sessions, orphan locks, and staging orphans. */
function reportSessionsAndState(
  deps: DoctorDeps,
  lp: ReturnType<typeof localPaths>,
  now: Date,
): void {
  const { reporter } = deps;
  const openIds = new Set<string>();

  if (existsSync(lp.ledgerDb)) {
    const ledger = new SessionLedger(lp.ledgerDb);
    try {
      for (const row of ledger.openRows()) {
        openIds.add(row.session_id);
        const stale =
          !row.transcript_path ||
          !existsSync(row.transcript_path) ||
          now.getTime() - statSync(row.transcript_path).mtimeMs > STALE_MS;
        if (stale) {
          reporter.line(
            `  [warn] stale session ${row.session_id} — run \`jejak attach ${row.session_id}\``,
          );
        }
      }
    } finally {
      ledger.close();
    }
  }

  const orphanLocks = listDir(lp.locks)
    .filter((f) => f.endsWith(".lock"))
    .map((f) => f.slice(0, -".lock".length))
    .filter((id) => !openIds.has(id));
  if (orphanLocks.length > 0) {
    reporter.line(
      `  [warn] orphan locks: ${orphanLocks.length} (no open session — safe to discard)`,
    );
  }

  const orphanStaging = listDir(lp.staging).filter((id) => !openIds.has(id));
  if (orphanStaging.length > 0) {
    reporter.line(
      `  [warn] orphan staging dirs: ${orphanStaging.length} (failed/abandoned — \`jejak attach\` or discard)`,
    );
  }
}

function reportFilesystem(deps: DoctorDeps): void {
  const marker = FS_MARKERS.find((m) => deps.repoRoot.includes(m));
  if (marker) {
    deps.reporter.line(
      `  [warn] filesystem: repo under ${marker} — sync services can corrupt git state`,
    );
  }
}

/** `--trace`: per-hook p50/p95/p99 + recent error count. */
function reportTrace(deps: DoctorDeps, lp: ReturnType<typeof localPaths>): void {
  const { reporter } = deps;
  if (!existsSync(lp.dispatchLog)) {
    reporter.line("  [trace] no hook timings recorded yet");
    return;
  }
  const records = parseDispatchLog(readFileSync(lp.dispatchLog, "utf8"));
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const { errorCount, timings } = summarizeDispatch(records, { nowMs });
  reporter.line(`  [trace] dispatch errors (7d): ${errorCount}`);
  for (const t of timings) {
    const slow = AGENT_HOOKS.has(t.hook) && t.p95 > HOOK_P95_BUDGET_MS;
    reporter.line(
      `  [trace] ${t.hook}: p50 ${t.p50}ms · p95 ${t.p95}ms · p99 ${t.p99}ms · n=${t.count}${
        slow ? `  ⚠ p95 > ${HOOK_P95_BUDGET_MS}ms` : ""
      }`,
    );
  }
}

function listDir(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir) : [];
}
