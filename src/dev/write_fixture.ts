import { existsSync } from "node:fs";
import { buildSessionMeta } from "../analytics/aggregate.js";
import { type GitClient, RealGitClient } from "../git/GitClient.js";
import { GitBlobPayloadSink } from "../shadow/GitBlobPayloadSink.js";
import { ShadowRepository } from "../shadow/ShadowRepository.js";
import { stripTranscript } from "../strip/Stripper.js";
import { readerFor } from "../strip/transcript/registry.js";

export interface DevWriteFixtureOptions {
  rawPath: string;
  handle: string;
  sessionId: string;
  agent?: string;
}

/**
 * Hidden `_dev write-fixture`: strip a raw transcript (offloading payloads to git blobs) and
 * upsert the session onto the shadow ref. One pass = exactly what the item-5 capture worker does.
 */
export async function devWriteFixture(
  opts: DevWriteFixtureOptions,
  git: GitClient = new RealGitClient(process.cwd()),
  out: (chunk: string) => void = (s) => process.stdout.write(s),
): Promise<void> {
  if (!existsSync(opts.rawPath)) {
    throw new Error(`jejak: cannot read transcript: ${opts.rawPath}`);
  }
  const agent = opts.agent ?? "claude-code";
  const sink = new GitBlobPayloadSink(git);
  const reader = readerFor(agent);

  const events = [];
  for await (const event of stripTranscript(reader, opts.rawPath, { sink })) events.push(event);
  // Canonical JSONL: one newline-terminated object per line (matches `_dev strip` output).
  const eventsJsonl = events.map((e) => `${JSON.stringify(e)}\n`).join("");

  const meta = buildSessionMeta(events, {
    sessionId: opts.sessionId,
    handle: opts.handle,
    agent,
    status: "captured",
  });

  const { commit, path } = await new ShadowRepository(git).upsert({
    handle: opts.handle,
    sessionId: opts.sessionId,
    eventsJsonl,
    meta,
    payloadEntries: sink.entries,
  });

  out(
    `wrote ${path} (${events.length} events, ${sink.entries.length} payloads) @ ${commit.slice(0, 8)}\n`,
  );
}
