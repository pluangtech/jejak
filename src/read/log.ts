import type { Reporter } from "../app/AppDeps.js";
import type { SessionEntry, SessionReader } from "./SessionReader.js";

export interface LogOptions {
  /** Show every handle's sessions (default: only `handleSlug`). */
  all?: boolean;
  /** Restrict to this slugified handle (the current dev, resolved by the command). */
  handleSlug?: string;
  json?: boolean;
}

/** `jejak log` — list captured sessions with their analytics. */
export async function runLog(
  reader: SessionReader,
  reporter: Reporter,
  opts: LogOptions = {},
): Promise<void> {
  const filter = opts.all ? undefined : opts.handleSlug;
  const entries = await reader.list({ handleSlug: filter });

  if (opts.json) {
    reporter.line(
      JSON.stringify(
        entries.map((e) => e.meta),
        null,
        2,
      ),
    );
    reporter.flush();
    return;
  }

  if (entries.length === 0) {
    reporter.line("no sessions captured yet");
    reporter.flush();
    return;
  }

  for (const line of renderTable(entries)) reporter.line(line);
  reporter.flush();
}

const HEADERS = ["SESSION", "STATUS", "STARTED", "TURNS", "IN", "OUT", "CACHE", "COST", "MODEL"];

function renderTable(entries: SessionEntry[]): string[] {
  const rows = entries.map((e) => {
    const m = e.meta;
    return [
      m.session_id,
      m.status,
      shortTime(m.started_at),
      String(m.turn_count),
      String(m.tokens.input),
      String(m.tokens.output),
      String(m.tokens.cache_creation + m.tokens.cache_read),
      m.cost_usd == null ? "-" : `$${m.cost_usd.toFixed(4)}`,
      m.models[0] ?? "-",
    ];
  });

  const widths = HEADERS.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cols: string[]) =>
    cols
      .map((c, i) => c.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [fmt(HEADERS), ...rows.map(fmt)];
}

/** ISO timestamp → "YYYY-MM-DD HH:MM" (or "-" when unset). */
function shortTime(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}
