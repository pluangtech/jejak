/**
 * Normalize a raw identity into a dev-handle: lowercase; collapse whitespace and the
 * separators [+/\\:@] to single `-`; strip edge `-`; cap at 64 chars. Returns null if nothing
 * usable remains (so the resolver falls through to the next source).
 */
export function slugify(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toLowerCase().trim();
  s = s.replace(/[\s+/\\:@]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 64) s = s.slice(0, 64).replace(/-+$/g, "");
  return s.length > 0 ? s : null;
}
