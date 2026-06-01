import type { Reporter } from "../app/AppDeps.js";
import type { StrippedBlock, StrippedEvent } from "../strip/types.js";
import type { SessionReader } from "./SessionReader.js";

export interface ShowOptions {
  /** Resolve offloaded payload blobs (`sha`) to their full content. */
  expand?: boolean;
  json?: boolean;
}

export class ShowError extends Error {}

/** `jejak show <session-id>` — print a captured session's stripped event stream. */
export async function runShow(
  reader: SessionReader,
  reporter: Reporter,
  sessionId: string,
  opts: ShowOptions = {},
): Promise<void> {
  const entry = await reader.find(sessionId);
  if (!entry) throw new ShowError(`jejak: no captured session '${sessionId}'`);

  const events = await reader.events(entry.handleSlug, entry.sessionId);

  if (opts.json) {
    reporter.line(JSON.stringify(events, null, 2));
    reporter.flush();
    return;
  }

  const m = entry.meta;
  const cost = m.cost_usd == null ? "" : `  ·  $${m.cost_usd.toFixed(4)}`;
  reporter.line(
    `session ${m.session_id}  ·  ${m.status}  ·  ${m.event_count} events  ·  ${m.turn_count} turns${cost}`,
  );
  if (m.redactions?.length) {
    reporter.line(`redactions: ${m.redactions.map((r) => `${r.type}×${r.count}`).join(", ")}`);
  }
  reporter.line("");

  for (let i = 0; i < events.length; i++) {
    await renderEvent(reader, reporter, events[i], i, opts.expand ?? false);
  }
  reporter.flush();
}

async function renderEvent(
  reader: SessionReader,
  reporter: Reporter,
  ev: StrippedEvent,
  index: number,
  expand: boolean,
): Promise<void> {
  const head = [
    `#${index}`,
    ev.timestamp ? shortTime(ev.timestamp) : null,
    ev.role ? `${ev.type}/${ev.role}` : ev.type,
    ev.model ?? null,
  ]
    .filter(Boolean)
    .join("  ");
  reporter.line(head);

  if (ev.text) reporter.line(indent(ev.text));
  for (const block of ev.content ?? []) {
    reporter.line(await renderBlock(reader, block, expand));
  }
  reporter.line("");
}

async function renderBlock(
  reader: SessionReader,
  block: StrippedBlock,
  expand: boolean,
): Promise<string> {
  const tag = block.name ? `${block.type}:${block.name}` : block.type;
  if (block.text) return indent(`[${tag}] ${block.text}`);

  if (block.sha) {
    if (expand) {
      const full = (await reader.payload(block.sha)).toString("utf8");
      return indent(`[${tag}] ${full}`);
    }
    const preview = block.preview ? `${block.preview} ` : "";
    return indent(`[${tag}] ${preview}<${block.sha.slice(0, 12)}… ${block.bytes ?? 0} bytes>`);
  }

  if (block.input !== undefined) return indent(`[${tag}] ${JSON.stringify(block.input)}`);
  return indent(`[${tag}]`);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

function shortTime(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}
