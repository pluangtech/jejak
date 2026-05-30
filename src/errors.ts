/** Typed errors with exit-code semantics for the CLI. */

/** A user-facing init failure; `exitCode` is what the process should exit with. */
export class InitError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "InitError";
    this.exitCode = exitCode;
  }
}

/** A failed `git` invocation. */
export class GitError extends Error {
  readonly code: number | null;
  readonly argv: string[];
  constructor(message: string, code: number | null, argv: string[]) {
    super(message);
    this.name = "GitError";
    this.code = code;
    this.argv = argv;
  }
}
