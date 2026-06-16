import type { CrawlOutput } from './crawl.js';

export type AccessMatrixEntry = { route: string; reachableBy: string[] };
export type AccessMatrix = Map<string, AccessMatrixEntry>;

export function buildAccessMatrix(crawls: CrawlOutput[]): AccessMatrix {
  const matrix: AccessMatrix = new Map();
  for (const crawl of crawls) {
    for (const page of crawl.pages) {
      const entry = matrix.get(page.url) ?? { route: page.url, reachableBy: [] };
      if (!entry.reachableBy.includes(crawl.role)) entry.reachableBy.push(crawl.role);
      matrix.set(page.url, entry);
    }
  }
  for (const entry of matrix.values()) entry.reachableBy.sort();
  return matrix;
}
