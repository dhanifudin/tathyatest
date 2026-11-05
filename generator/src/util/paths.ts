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

/** Path plus query of a URL or path, resolved against the base URL. */
export function resolveHrefPathAndSearch(path: string, baseUrl: string): string {
  try {
    const url = new URL(path, baseUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    const [withoutHash] = path.split('#', 1);
    const [pathname = '/', search = ''] = withoutHash.split('?', 2);
    return `${pathname || '/'}${search ? `?${search}` : ''}`;
  }
}

/**
 * Default locations, relative to the working directory. Runtime outputs are listed in the README table
 * "Where outputs go"; the root playwright.config.ts uses the same names for storage states and specs.
 */
export const DEFAULT_PATHS = {
  configFile: 'tathya.config.yaml',
  crawlDir: 'crawl',
  generatedDir: 'tests/generated',
  metricsDir: 'metrics',
} as const;
