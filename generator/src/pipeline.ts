import type { TathyaConfig } from './config.js';
import { loadCrawls, type CrawlOutput } from './crawl.js';
import { emit } from './emit/index.js';
import type { ManifestEntry } from './manifest.js';
import { mapTestCases, type TestCase } from './mapper.js';
import { buildAccessMatrix, type AccessMatrix } from './rbac.js';

export type GeneratedSuite = {
  crawls: CrawlOutput[];
  matrix: AccessMatrix;
  cases: TestCase[];
  manifest: ManifestEntry[];
};

/**
 * The generate stage: stored crawls to emitted suite. One implementation for `tt generate`, `tt all`,
 * and `tt eval`, so the three can never disagree about what generation means.
 */
export async function generateSuite(config: TathyaConfig, crawlDir = 'crawl'): Promise<GeneratedSuite> {
  const crawls = await loadCrawls(crawlDir, config.auth.roles.map((role) => role.name));
  const matrix = buildAccessMatrix(crawls);
  const cases = mapTestCases(crawls, matrix, config);
  const manifest = await emit(cases, config);
  return { crawls, matrix, cases, manifest };
}
