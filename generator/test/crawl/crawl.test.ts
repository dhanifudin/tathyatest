import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureCrawls, loadCrawls, shouldRefreshCrawls } from '../../src/crawl/crawl.js';
import { crawlFingerprint } from '../../src/crawl/fingerprint.js';
import { CRAWL_SCHEMA_VERSION, crawlOutputSchema } from '../../src/crawl/model.js';
import type { TathyaConfig } from '../../src/config.js';
import { makeConfig } from '../helpers/fixtures.js';

const config = makeConfig();

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
      schemaVersion: 2,
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
      schemaVersion: 2,
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

describe('loadCrawls role filtering', () => {
  const snapshot = (role: string, baseUrl: string) => JSON.stringify({
    baseUrl,
    schemaVersion: 2,
    role,
    crawledAt: '2026-06-27T00:00:00.000Z',
    pages: [],
  });

  it('ignores crawl files for roles outside the configured set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-load-crawls-'));
    try {
      // Stale snapshot from a previously evaluated subject with different roles.
      await writeFile(join(dir, 'admin.json'), snapshot('admin', 'http://127.0.0.1:8000'));
      await writeFile(join(dir, 'standard_user.json'), snapshot('standard_user', 'https://www.saucedemo.com'));

      const crawls = await loadCrawls(dir, ['standard_user']);

      expect(crawls).toHaveLength(1);
      expect(crawls[0].role).toBe('standard_user');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads every crawl file when no role filter is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-load-crawls-'));
    try {
      await writeFile(join(dir, 'admin.json'), snapshot('admin', 'http://127.0.0.1:8000'));
      await writeFile(join(dir, 'user.json'), snapshot('user', 'http://127.0.0.1:8000'));

      const crawls = await loadCrawls(dir);

      expect(crawls.map((crawl) => crawl.role)).toEqual(['admin', 'user']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('crawl bootstrap', () => {
  const current = {
    baseUrl: config.baseUrl, schemaVersion: CRAWL_SCHEMA_VERSION, role: 'admin', crawledAt: '2026-11-25T00:00:00.000Z',
    configFingerprint: crawlFingerprint(config), pages: [],
  };

  async function refreshes(files: Record<string, unknown>, target: TathyaConfig = config): Promise<boolean> {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), JSON.stringify(content));
      return await shouldRefreshCrawls(target, dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('keeps a crawl that matches the config', async () => {
    await expect(refreshes({ 'admin.json': current })).resolves.toBe(false);
  });

  it('crawls when a role file is missing or unreadable', async () => {
    const two: TathyaConfig = { ...config, auth: { ...config.auth, roles: [...config.auth.roles, { name: 'user', username: 'u', password: 'p' }] } };
    await expect(refreshes({})).resolves.toBe(true);
    await expect(refreshes({ 'admin.json': {} })).resolves.toBe(true);
    await expect(refreshes({ 'admin.json': current }, two)).resolves.toBe(true);
  });

  it('crawls again for an older contract, another app, or changed crawl settings', async () => {
    await expect(refreshes({ 'admin.json': { ...current, schemaVersion: CRAWL_SCHEMA_VERSION - 1 } })).resolves.toBe(true);
    await expect(refreshes({ 'admin.json': { ...current, baseUrl: 'http://127.0.0.1:8001' } })).resolves.toBe(true);
    await expect(refreshes({ 'admin.json': current }, makeConfig({ crawl: { include: ['/reports'] } }))).resolves.toBe(true);
    await expect(refreshes({ 'admin.json': { ...current, configFingerprint: undefined } })).resolves.toBe(true);
  });

  it('keeps passwords out of the fingerprint and ignores settings that do not shape a crawl', () => {
    const changed = makeConfig({ auth: { loginPath: '/login', roles: [{ name: 'admin', username: 'admin@example.com', password: 'other' }] }, data: { fields: { title: 'x' } } });
    expect(crawlFingerprint(changed)).toBe(crawlFingerprint(config));
  });

  it('crawls again with force even when the cached crawl is current', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-crawl-bootstrap-'));
    try {
      await writeFile(join(dir, 'admin.json'), JSON.stringify(current));
      const crawlRunner = vi.fn(async () => undefined);
      await ensureCrawls(config, { crawlDir: dir, crawlRunner });
      expect(crawlRunner).not.toHaveBeenCalled();
      await ensureCrawls(config, { crawlDir: dir, crawlRunner, force: true });
      expect(crawlRunner).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('older crawl files', () => {
  it('load with the new fields defaulted', () => {
    const parsed = crawlOutputSchema.parse({
      baseUrl: 'http://127.0.0.1:8000', schemaVersion: 2, role: 'admin', crawledAt: '2026-06-27T00:00:00.000Z',
      pages: [{
        url: '/todos', title: 'Todos', buttons: [], tables: [],
        links: [{ href: '/todos', text: 'Todos', locator: { strategy: 'role', value: 'link:Todos' } }],
        forms: [{
          action: '/todos', method: 'POST', crudOp: 'create', noValidate: false, submit: { text: 'Create', locator: { strategy: 'css', value: 'button' } },
          fields: [{ name: 't', type: 'text', label: null, required: false, constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null }, options: null, nameHints: [], locator: { strategy: 'name', value: 't' } }],
        }],
      }],
    });
    expect(parsed).toMatchObject({ landingPath: null, configFingerprint: null });
    expect(parsed.pages[0].links[0]).toMatchObject({ inPage: false, method: null });
    expect(parsed.pages[0].forms[0]).toMatchObject({ declaresTarget: true, hasActionAttribute: true });
    expect(parsed.pages[0].forms[0].fields[0].prefilled).toBe(false);
  });
});
