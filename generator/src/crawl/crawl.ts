import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { renderedCrawl } from './session.js';
import { assertReachable } from './reachability.js';
import type { TathyaConfig } from '../config.js';
import { crawlOutputSchema, type CrawlOutput } from './model.js';
import { DEFAULT_PATHS } from '../util/paths.js';

/**
 * Load crawl snapshots from `dir`. When `roles` is given, only `<role>.json` files for those
 * roles are read — this prevents cross-subject contamination when the crawl dir still holds
 * snapshots from a previously evaluated subject with different role names.
 */
export async function loadCrawls(dir: string = DEFAULT_PATHS.crawlDir, roles?: string[]): Promise<CrawlOutput[]> {
  const entries = await readdir(dir);
  const wanted = roles ? new Set(roles.map((role) => `${role}.json`)) : null;
  const crawls = await Promise.all(entries
    .filter((name) => name.endsWith('.json') && (wanted === null || wanted.has(name)))
    .map(async (name) => {
      const parsed = JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
      return crawlOutputSchema.parse(parsed);
    }));
  return crawls.sort((a, b) => a.role.localeCompare(b.role));
}

export async function runCrawl(config: TathyaConfig): Promise<void> {
  await assertReachable(config.baseUrl);
  await mkdir(DEFAULT_PATHS.crawlDir, { recursive: true });
  // Drop snapshots from other subjects/roles so downstream loadCrawls never mixes subjects.
  const configuredRoles = new Set(config.auth.roles.map((role) => `${role.name}.json`));
  for (const entry of await readdir(DEFAULT_PATHS.crawlDir)) {
    if (entry.endsWith('.json') && !configuredRoles.has(entry)) await rm(join(DEFAULT_PATHS.crawlDir, entry));
  }
  await renderedCrawl(config);
}

export type EnsureCrawlsOptions = {
  crawlDir?: string;
  configPath?: string;
  crawlRunner?: (config: TathyaConfig) => Promise<void>;
  /** Crawl again even when the cached per-role files are newer than the config (`--fresh`). */
  force?: boolean;
};

export async function ensureCrawls(config: TathyaConfig, options: EnsureCrawlsOptions = {}): Promise<void> {
  const crawlDir = options.crawlDir ?? DEFAULT_PATHS.crawlDir;
  const configPath = options.configPath ?? DEFAULT_PATHS.configFile;
  const crawlRunner = options.crawlRunner ?? runCrawl;
  if (options.force || await shouldRefreshCrawls(config, crawlDir, configPath)) {
    await crawlRunner(config);
  }
}

export async function shouldRefreshCrawls(config: TathyaConfig, crawlDir: string = DEFAULT_PATHS.crawlDir, configPath: string = DEFAULT_PATHS.configFile): Promise<boolean> {
  try {
    const configStat = await stat(configPath);
    for (const role of config.auth.roles) {
      const path = join(crawlDir, `${role.name}.json`);
      const crawlStat = await stat(path);
      if (crawlStat.mtimeMs < configStat.mtimeMs) return true;
    }
    return false;
  } catch {
    return true;
  }
}
