/** Collapse whitespace runs and trim; `null` becomes the empty string. */
export function normalizeTitleText(text: string | null): string {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Number of matches of a global regex in `src` (static spec analysis). */
export function countPattern(src: string, pattern: RegExp): number {
  return (src.match(pattern) ?? []).length;
}
