import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { renderedCrawl } from './session.js';
import { assertReachable } from './reachability.js';
import type { TathyaConfig } from '../config.js';
import { CRAWL_SCHEMA_VERSION, crawlOutputSchema, type CrawlOutput } from './model.js';
import { crawlFingerprint } from './fingerprint.js';
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
  crawlRunner?: (config: TathyaConfig) => Promise<void>;
  /** Crawl again even when the cached per-role files are current (`--fresh`). */
  force?: boolean;
};

export async function ensureCrawls(config: TathyaConfig, options: EnsureCrawlsOptions = {}): Promise<void> {
  const crawlDir = options.crawlDir ?? DEFAULT_PATHS.crawlDir;
  const crawlRunner = options.crawlRunner ?? runCrawl;
  if (options.force || await shouldRefreshCrawls(config, crawlDir)) {
    await crawlRunner(config);
  }
}

/**
 * Whether any role lacks a crawl that matches this config: missing or unreadable, written by an
 * older contract, taken from another app, or shaped by different crawl or login settings.
 */
export async function shouldRefreshCrawls(config: TathyaConfig, crawlDir: string = DEFAULT_PATHS.crawlDir): Promise<boolean> {
  const fingerprint = crawlFingerprint(config);
  for (const role of config.auth.roles) {
    try {
      const crawl = crawlOutputSchema.parse(JSON.parse(await readFile(join(crawlDir, `${role.name}.json`), 'utf8')));
      if (crawl.schemaVersion < CRAWL_SCHEMA_VERSION || crawl.baseUrl !== config.baseUrl || crawl.configFingerprint !== fingerprint) return true;
    } catch {
      return true;
    }
  }
  return false;
}
