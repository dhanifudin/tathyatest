/** Collapse whitespace runs and trim; `null` becomes the empty string. */
export function normalizeTitleText(text: string | null): string {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
}
