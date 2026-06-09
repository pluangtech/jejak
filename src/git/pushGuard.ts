/**
 * Single source of truth for the shadow-ref push guard (the `pre-push` hook + its handshake).
 *
 * The shadow ref lives under `refs/heads/` (`SHADOW_REF`), so a bare `git push --all`, `--mirror`,
 * `push.default=matching`, an explicit refspec, or a delete would carry it to a remote and bypass
 * the `jejak push` PII gate. A client-side `pre-push` hook is a complete chokepoint: git runs it
 * for every one of those vectors. `jejak`'s own gated push sets {@link PUSH_GUARD_ENV} so it passes
 * the hook; everything else is refused (with a documented manual override).
 */

/** Env var the gated push sets so the guard lets it through. Also the deliberate manual override. */
export const PUSH_GUARD_ENV = "JEJAK_INTERNAL_PUSH";

/**
 * The jejak namespace segment to match in EITHER ref column of the pre-push stdin. Matching the
 * segment (not an anchored `refs/heads/…`) is deliberate and load-bearing:
 * - `--mirror` presents the ref as `refs/remotes/origin/jejak/sessions/v1` (not under refs/heads)
 * - a delete (`git push origin :ref`) puts the name only in the remote-ref column
 * - it also covers a future `…/v2` and the `…/v1-archive-*` refs
 */
export const SHADOW_REF_NS = "jejak/sessions/";

/** Marker that identifies a jejak-written pre-push hook (refresh ours, never clobber a foreign one). */
export const PRE_PUSH_MARKER = "jejak pre-push guard";

/**
 * Render the `pre-push` hook — pure bash, deliberately self-contained (no `jejak` invocation) so it
 * fails safe even if the binary is missing and costs nothing on a normal code push (the `case`
 * falls through when no ref touches the namespace).
 */
export function renderPrePushGuard(): string {
  return `#!/usr/bin/env bash
# ${PRE_PUSH_MARKER}
if [ -n "$${PUSH_GUARD_ENV}" ]; then exit 0; fi
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$local_ref$remote_ref" in
    *${SHADOW_REF_NS}*)
      echo "jejak: refusing to push the trace shadow ref via git." >&2
      echo "       Use 'jejak push' (it enforces the PII gate)." >&2
      echo "       Deliberate override: ${PUSH_GUARD_ENV}=1 git push ...  (or --no-verify)" >&2
      exit 1 ;;
  esac
done
exit 0
`;
}
