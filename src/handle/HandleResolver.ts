import { InitError } from "../errors.js";
import { HANDLE_SOURCES, type HandleResolverDeps, type HandleSource } from "./sources.js";

/**
 * Resolve a dev-handle by trying each source in order (Chain of Responsibility). Idempotent
 * and side-effect-free, so the capture/hook path can call it for teammates who never ran init.
 */
export async function resolveDevHandle(
  deps: HandleResolverDeps,
  sources: HandleSource[] = HANDLE_SOURCES,
): Promise<string> {
  for (const source of sources) {
    const handle = await source.resolve(deps);
    if (handle) return handle;
  }
  throw new InitError(
    "jejak: could not resolve a dev handle. Set `git config user.name` (or user.email, or jejak.handle).",
  );
}
