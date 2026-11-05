import type { TathyaConfig } from './config.js';
import { loadCrawls } from './crawl/crawl.js';
import { type CrawlOutput } from './crawl/model.js';
import { emit } from './emit/index.js';
import type { ManifestEntry } from './generate/manifest.js';
import { mapTestCases } from './generate/mapper.js';
import { type TestCase } from './generate/test-case.js';
import { buildAccessMatrix, type AccessMatrix } from './generate/rbac.js';
import { DEFAULT_PATHS } from './util/paths.js';

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
export async function generateSuite(config: TathyaConfig, crawlDir: string = DEFAULT_PATHS.crawlDir): Promise<GeneratedSuite> {
  const crawls = await loadCrawls(crawlDir, config.auth.roles.map((role) => role.name));
  const matrix = buildAccessMatrix(crawls);
  const cases = mapTestCases(crawls, matrix, config);
  const manifest = await emit(cases, config);
  return { crawls, matrix, cases, manifest };
}
