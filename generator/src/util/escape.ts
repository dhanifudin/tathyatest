/** Escape a value for use inside a double-quoted CSS attribute selector (`[name="..."]`). */
export function escapeAttrValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/** Escape a string so it matches literally inside a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
