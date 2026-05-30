/** A selectable option in a {@link Prompter.select}. */
export interface Choice<T> {
  name: string;
  value: T;
}

/**
 * Interactive prompt seam. Real impl wraps @inquirer/prompts; tests inject a fake so unit
 * tests need no TTY.
 */
export interface Prompter {
  /** Whether a real interactive terminal is attached. */
  readonly isInteractive: boolean;
  confirm(message: string, defaultYes: boolean): Promise<boolean>;
  select<T>(message: string, choices: Choice<T>[]): Promise<T>;
}
