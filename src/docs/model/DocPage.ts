/** A parsed markdown page: simple `key: value` frontmatter plus the remaining body. */
export interface DocPage {
  frontmatter: Record<string, string>;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/**
 * Parse a markdown document. Frontmatter is an optional leading `---` block of `key: value` lines
 * (a deliberately small subset — no YAML dependency). Missing frontmatter yields `{}`.
 */
export function parseDocPage(content: string): DocPage {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string> = {};
  for (const raw of match[1].split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }
  return { frontmatter, body: content.slice(match[0].length) };
}
