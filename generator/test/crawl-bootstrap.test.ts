import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { crawlOutputSchema, ensureCrawls, shouldRefreshCrawls } from '../src/crawl.js';
import type { TathyaConfig } from '../src/config.js';

const config: TathyaConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  output: { dir: 'tests/generated', language: 'ts' },
  coverage: 'all',
  oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
  auth: {
    loginPath: '/login',
    roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
  },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
  data: { fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [] },
};

describe('crawlOutputSchema', () => {
  it('back-fills controls:[] for old crawl JSON that lacks the field', () => {
    const legacyPage = {
      url: '/inventory.html',
      title: 'Inventory',
      forms: [],
      links: [],
      buttons: [],
      tables: [],
      // controls intentionally absent — older crawl output
    };
    const raw = {
      baseUrl: 'https://www.saucedemo.com',
      engine: 'rendered',
      role: 'standard_user',
      crawledAt: '2026-06-27T00:00:00.000Z',
      pages: [legacyPage],
    };
    const parsed = crawlOutputSchema.parse(raw);
    expect(parsed.pages[0].controls).toEqual([]);
  });

  it('preserves controls from new crawl JSON', () => {
    const raw = {
      baseUrl: 'https://www.saucedemo.com',
      engine: 'rendered',
      role: 'standard_user',
      crawledAt: '2026-06-27T00:00:00.000Z',
      pages: [{
        url: '/inventory.html',
        title: 'Inventory',
        forms: [],
        links: [],
        buttons: [],
        tables: [],
        controls: [{
          kind: 'select',
          text: null,
          options: [{ value: 'az', label: 'Name (A to Z)' }],
          locator: { strategy: 'testid', value: 'product-sort-container' },
        }],
      }],
    };
    const parsed = crawlOutputSchema.parse(raw);
    expect(parsed.pages[0].controls).toHaveLength(1);
    expect(parsed.pages[0].controls?.[0].kind).toBe('select');
    expect(parsed.pages[0].controls?.[0].options?.[0].value).toBe('az');
  });
});

describe('crawl bootstrap', () => {
  it('refreshes when crawl outputs are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      const configPath = join(dir, 'tathya.config.yaml');
      const crawlDir = join(dir, 'crawl');
      await writeFile(configPath, YAML.stringify(config));

      const crawlRunner = vi.fn(async () => undefined);
      await ensureCrawls(config, { crawlDir, configPath, crawlRunner });

      expect(crawlRunner).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refreshes when a configured role crawl file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        auth: {
          ...config.auth,
          roles: [
            { name: 'admin', username: 'admin@example.com', password: 'password' },
            { name: 'user', username: 'user@example.com', password: 'password' },
          ],
        },
      };
      const configPath = join(dir, 'tathya.config.yaml');
      const crawlDir = join(dir, 'crawl');
      await mkdir(crawlDir, { recursive: true });
      await writeFile(configPath, YAML.stringify(localConfig));
      await writeFile(join(crawlDir, 'admin.json'), '{}');

      const crawlRunner = vi.fn(async () => undefined);
      await ensureCrawls(localConfig, { crawlDir, configPath, crawlRunner });

      expect(crawlRunner).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips refresh when crawl outputs are newer than config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      const configPath = join(dir, 'tathya.config.yaml');
      const crawlDir = join(dir, 'crawl');
      await mkdir(crawlDir, { recursive: true });
      await writeFile(configPath, YAML.stringify(config));
      await writeFile(join(crawlDir, 'admin.json'), '{}');
      await utimes(configPath, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));
      await utimes(join(crawlDir, 'admin.json'), new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'));

      const crawlRunner = vi.fn(async () => undefined);
      await ensureCrawls(config, { crawlDir, configPath, crawlRunner });

      expect(crawlRunner).not.toHaveBeenCalled();
      await expect(shouldRefreshCrawls(config, crawlDir, configPath)).resolves.toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refreshes when crawl outputs are older than config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      const configPath = join(dir, 'tathya.config.yaml');
      const crawlDir = join(dir, 'crawl');
      await mkdir(crawlDir, { recursive: true });
      await writeFile(configPath, YAML.stringify(config));
      await writeFile(join(crawlDir, 'admin.json'), '{}');
      await utimes(configPath, new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'));
      await utimes(join(crawlDir, 'admin.json'), new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));

      const crawlRunner = vi.fn(async () => undefined);
      await ensureCrawls(config, { crawlDir, configPath, crawlRunner });

      expect(crawlRunner).toHaveBeenCalledTimes(1);
      await expect(shouldRefreshCrawls(config, crawlDir, configPath)).resolves.toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
