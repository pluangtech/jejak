import { confirm, select } from "@inquirer/prompts";
import { InitError } from "../errors.js";
import type { Choice, Prompter } from "./Prompter.js";

/** {@link Prompter} backed by @inquirer/prompts. Ctrl+C → InitError(exitCode 130). */
export class InquirerPrompter implements Prompter {
  get isInteractive(): boolean {
    return Boolean(process.stdin.isTTY);
  }

  async confirm(message: string, defaultYes: boolean): Promise<boolean> {
    try {
      return await confirm({ message, default: defaultYes });
    } catch (err) {
      throw mapCancel(err);
    }
  }

  async select<T>(message: string, choices: Choice<T>[]): Promise<T> {
    try {
      return await select({
        message,
        choices: choices.map((c) => ({ name: c.name, value: c.value })),
      });
    } catch (err) {
      throw mapCancel(err);
    }
  }
}

/** @inquirer throws `ExitPromptError` on SIGINT — map it to the 130 convention. */
function mapCancel(err: unknown): Error {
  if (err instanceof Error && err.name === "ExitPromptError") {
    return new InitError("jejak: cancelled", 130);
  }
  return err instanceof Error ? err : new Error(String(err));
}
