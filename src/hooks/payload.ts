/** Normalized Claude Code hook payload (parsed from the JSON Claude pipes to the hook on stdin). */
export interface HookEvent {
  sessionId: string;
  transcriptPath?: string;
  cwd?: string;
  /** SessionStart only: "startup" | "resume" | … */
  source?: string;
}

/** Parse the raw hook stdin JSON. Tolerant of junk/empty — returns null rather than throwing. */
export function parseHookPayload(raw: string): HookEvent | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sessionId = typeof obj.session_id === "string" ? obj.session_id : undefined;
  if (!sessionId) return null;
  return {
    sessionId,
    transcriptPath: typeof obj.transcript_path === "string" ? obj.transcript_path : undefined,
    cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
    source: typeof obj.source === "string" ? obj.source : undefined,
  };
}

/** Read all of stdin (the hook payload). Resolves to "" if stdin is empty/closed. */
export async function readStdin(stream: NodeJS.ReadStream = process.stdin): Promise<string> {
  if (stream.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
