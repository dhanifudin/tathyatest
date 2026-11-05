/** Origin used to resolve relative URLs when only the path matters. Never contacted. */
export const PLACEHOLDER_ORIGIN = 'http://tathyatest.local';

/** Path of a URL or path-like string: no origin, query, or fragment; `/` when empty. */
export function canonicalPath(path: string): string {
  try {
    return new URL(path, PLACEHOLDER_ORIGIN).pathname || '/';
  } catch {
    return stripQuery(path) || '/';
  }
}

/** Everything before the first `?` or `#`; the input itself when it has neither. */
export function stripQuery(url: string): string {
  const [head = ''] = url.split(/[?#]/, 1);
  return head;
}
