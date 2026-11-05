/** Escape a value for use inside a double-quoted CSS attribute selector (`[name="..."]`). */
export function escapeAttrValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/** Escape a string so it matches literally inside a regular expression. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape an identifier for a `#id` selector: any character outside `[A-Za-z0-9_-]` gets a backslash. */
export function escapeCssIdent(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
}
