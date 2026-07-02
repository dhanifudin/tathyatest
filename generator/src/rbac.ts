import type { CrawlOutput } from './crawl.js';

export type AccessMatrixEntry = { route: string; reachableBy: string[] };
export type AccessMatrix = Map<string, AccessMatrixEntry>;

export function buildAccessMatrix(crawls: CrawlOutput[]): AccessMatrix {
  const matrix: AccessMatrix = new Map();
  for (const crawl of crawls) {
    for (const page of crawl.pages) {
      // RBAC operates at route (pathname) granularity: query variants of the same path — e.g.
      // pagination pages one role happens to have more of (/todos?page=3) — are not separate
      // protected routes and would otherwise produce bogus "blocked" cases.
      const route = normalizeRoute(page.url);
      const entry = matrix.get(route) ?? { route, reachableBy: [] };
      if (!entry.reachableBy.includes(crawl.role)) entry.reachableBy.push(crawl.role);
      matrix.set(route, entry);
    }
  }
  for (const entry of matrix.values()) entry.reachableBy.sort();
  return matrix;
}

function normalizeRoute(url: string): string {
  const queryStart = url.search(/[?#]/);
  return queryStart === -1 ? url : url.slice(0, queryStart);
}
