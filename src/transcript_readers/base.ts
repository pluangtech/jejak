import type { StrippedEvent } from "../types.js";

export interface TranscriptReader {
  read(path: string): AsyncIterable<StrippedEvent>;
}
