import type { GitClient } from "../git/GitClient.js";
import type { Prompter } from "../prompt/Prompter.js";

/** Collects user-facing output so commands stay pure and tests can assert on it. */
export interface Reporter {
  line(message: string): void;
  flush(): void;
}

/** Injected collaborators shared by all commands (the DI root). */
export interface AppDeps {
  git: GitClient;
  prompter: Prompter;
  reporter: Reporter;
}

/** Default {@link Reporter} that buffers lines and prints them on flush. */
export class ConsoleReporter implements Reporter {
  private lines: string[] = [];
  line(message: string): void {
    this.lines.push(message);
  }
  flush(): void {
    if (this.lines.length > 0) console.log(this.lines.join("\n"));
    this.lines = [];
  }
}
