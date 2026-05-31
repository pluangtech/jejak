import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Payload } from "../types.js";
import type { PayloadSink } from "./PayloadSink.js";

/**
 * Default {@link PayloadSink}: sha256 + byte count, with optional dump to `<dir>/<sha>` (dedup'd).
 * Used by `_dev strip`; the sha is still computed (so change-detection works) even without a dir.
 */
export class HashingPayloadSink implements PayloadSink {
  private readonly written = new Set<string>();

  constructor(private readonly dir?: string) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  async put(content: string): Promise<Payload> {
    const buf = Buffer.from(content, "utf8");
    const sha = createHash("sha256").update(buf).digest("hex");
    if (this.dir && !this.written.has(sha)) {
      writeFileSync(join(this.dir, sha), buf);
      this.written.add(sha);
    }
    return { sha, bytes: buf.byteLength };
  }
}
