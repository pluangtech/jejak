import type { Reporter } from "../app/AppDeps.js";
import { SnapshotWorker } from "../capture/SnapshotWorker.js";
import type { GitClient } from "../git/GitClient.js";
import { createCaptureContext } from "../hooks/CaptureContext.js";
import type { Prompter } from "../prompt/Prompter.js";
import { parseSessionTrailers } from "../read/link.js";

export interface AttachDeps {
  git: GitClient;
  prompter: Prompter;
  reporter: Reporter;
}

export interface AttachOptions {
  /** Skip the amend confirmation when HEAD has no jejak trailer. */
  force?: boolean;
}

/** Raised when there's nothing to attach (unknown session) — the command turns it into exit 1. */
export class AttachError extends Error {}

/** Outcome of linking HEAD to a session (DESIGN-LLD §16.4 three branches). */
export type LinkAction = "already" | "appended" | "amended" | "unlinked";

export interface LinkResult {
  action: LinkAction;
  /** The (possibly rewritten) HEAD sha the session is linked to, or null when unlinked. */
  commitSha: string | null;
}

/**
 * Link HEAD to `sessionId` via a `Jejak-Session` trailer (the pure decision + git effects, no
 * ledger/capture). Three branches: HEAD already has a jejak trailer → append (no prompt); HEAD has
 * none → prompt to amend (`--force` skips); unborn/detached HEAD → shadow-only (unlinked).
 */
export async function linkHeadToSession(
  deps: AttachDeps,
  sessionId: string,
  opts: AttachOptions,
): Promise<LinkResult> {
  const head = await deps.git.resolveRef("HEAD");
  if (head == null || (await deps.git.isDetachedHead())) {
    return { action: "unlinked", commitSha: null };
  }

  const body = (await deps.git.logBody(head)) ?? "";
  const existing = parseSessionTrailers(body);
  if (existing.includes(sessionId)) return { action: "already", commitSha: head };

  const hadJejakTrailer = existing.length > 0;
  if (!hadJejakTrailer) {
    const amend =
      opts.force ||
      (await deps.prompter.confirm(
        "HEAD has no jejak trailer — amend it to link this session?",
        false,
      ));
    if (!amend) return { action: "unlinked", commitSha: null };
  }

  const newMsg = await deps.git.appendTrailers(body, [`Jejak-Session: ${sessionId}`]);
  await deps.git.amendHeadMessage(newMsg);
  const newHead = await deps.git.resolveRef("HEAD");
  return { action: hadJejakTrailer ? "appended" : "amended", commitSha: newHead };
}

/**
 * `jejak attach <session-id>` — finalize a session the hooks left open, then link it to HEAD
 * (DESIGN-LLD §16.4). Reuses the capture worker for strip→PII→upsert→finalize.
 */
export async function runAttach(
  deps: AttachDeps,
  sessionId: string,
  opts: AttachOptions = {},
): Promise<void> {
  const repoRoot = await deps.git.repoRoot();
  const ctx = createCaptureContext(repoRoot, deps.git);
  try {
    const row = ctx.ledger.get(sessionId);
    if (!row || !row.transcript_path) {
      throw new AttachError(
        `jejak: no recoverable session '${sessionId}' — the hooks never recorded a transcript for it`,
      );
    }

    // 1. Capture + finalize via the same worker the SessionEnd hook uses.
    await new SnapshotWorker(ctx).run(sessionId, { final: true });
    deps.reporter.line(`captured ${sessionId} onto the shadow ref`);

    // 2. Three-branch commit link.
    const link = await linkHeadToSession(deps, sessionId, opts);
    if (link.commitSha) {
      // Backfill commit_sha without clobbering the finalized status (captured / captured-with-blocks).
      const finalized = ctx.ledger.get(sessionId)?.status ?? "captured";
      ctx.ledger.setStatus(sessionId, finalized, { commitSha: link.commitSha });
    }
    deps.reporter.line(`  link: ${LINK_MESSAGE[link.action](sessionId)}`);
    deps.reporter.flush();
  } finally {
    ctx.ledger.close();
  }
}

const LINK_MESSAGE: Record<LinkAction, (id: string) => string> = {
  already: (id) => `HEAD already linked to ${id}`,
  appended: (id) => `appended Jejak-Session: ${id} to HEAD`,
  amended: (id) => `amended HEAD with Jejak-Session: ${id}`,
  unlinked: () => "none (no branch HEAD / declined) — captured but unlinked",
};
