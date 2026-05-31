/** Strategy: turns some input into a markdown page. One implementation per page type. */
export interface PageRenderer<TInput> {
  render(input: TInput): string;
}
