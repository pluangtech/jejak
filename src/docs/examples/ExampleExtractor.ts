/** A runnable example block extracted from a doc page. */
export interface RunnableExample {
  /** Commands (with the leading `$ ` prompt stripped). */
  commands: string[];
}

/** Marker comment that opts a following ```console block into execution. */
export const RUN_MARKER = "<!-- run -->";

/**
 * Extracts ```console blocks explicitly tagged with `<!-- run -->`, returning the `$`-prefixed
 * commands in each. Only tagged blocks run — most doc examples (install, edits) are illustrative.
 */
export class ExampleExtractor {
  extract(content: string): RunnableExample[] {
    const lines = content.split("\n");
    const examples: RunnableExample[] = [];
    let armed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === RUN_MARKER) {
        armed = true;
        continue;
      }

      if (armed && line.startsWith("```")) {
        const commands: string[] = [];
        i++;
        for (; i < lines.length && !lines[i].trim().startsWith("```"); i++) {
          const cmd = lines[i].trim();
          if (cmd.startsWith("$ ")) commands.push(cmd.slice(2).trim());
        }
        examples.push({ commands });
        armed = false;
        continue;
      }

      if (line !== "") armed = false; // marker only applies to the immediately-following block
    }

    return examples;
  }
}
