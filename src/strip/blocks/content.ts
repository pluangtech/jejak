import { PREVIEW_HEAD, PREVIEW_TAIL } from "../constants.js";

/** Normalize a tool_result `content` (string | block array | object) into a single string. */
export function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "text" in c) return String((c as { text: unknown }).text);
        return JSON.stringify(c);
      })
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

/** Head+tail preview for offloaded bulk content (failures usually sit at the tail). */
export function preview(s: string): string {
  if (s.length <= PREVIEW_HEAD + PREVIEW_TAIL) return s;
  const elided = s.length - PREVIEW_HEAD - PREVIEW_TAIL;
  return `${s.slice(0, PREVIEW_HEAD)}\n…[${elided} chars elided]…\n${s.slice(-PREVIEW_TAIL)}`;
}
