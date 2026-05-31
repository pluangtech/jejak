import { createHash } from "node:crypto";
import type { GitClient, TreeEntry } from "../git/GitClient.js";
import type { PayloadSink } from "../strip/payload/PayloadSink.js";
import type { Payload } from "../strip/types.js";

/**
 * {@link PayloadSink} that writes each offloaded payload as a real git blob and records the tree
 * entry `payloads/<sha256>` → blob. The stripped event references the payload by its **sha256**
 * (sink-independent, matching HashingPayloadSink), while the git object id addresses the blob —
 * so identical payloads dedup natively and `jejak show --expand` can fetch them later.
 *
 * Inject into `stripTranscript`; after stripping, hand `entries` to `ShadowRepository.upsert`.
 */
export class GitBlobPayloadSink implements PayloadSink {
  readonly entries: TreeEntry[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly git: GitClient) {}

  async put(content: string): Promise<Payload> {
    const buf = Buffer.from(content, "utf8");
    const sha = createHash("sha256").update(buf).digest("hex");
    if (!this.seen.has(sha)) {
      const oid = await this.git.hashObject(buf);
      this.entries.push({ mode: "100644", sha: oid, path: `payloads/${sha}` });
      this.seen.add(sha);
    }
    return { sha, bytes: buf.byteLength };
  }
}
