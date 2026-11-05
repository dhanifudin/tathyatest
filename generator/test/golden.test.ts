import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { loadCrawls } from '../src/crawl/crawl.js';
import { emit } from '../src/emit/index.js';
import { buildAccessMatrix } from '../src/generate/rbac.js';
import { mapTestCases } from '../src/generate/mapper.js';

/**
 * Characterization ("golden") test of the whole generation path on recorded crawls: the crawl
 * contract goes in, the emitted specs, support module, and manifest come out. A refactor must keep
 * every byte identical; a deliberate behavior change regenerates the expectations with
 * `UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts` and the diff is reviewed in the pull request.
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

type Scenario = { name: string; crawls: Record<string, string>; config: unknown };

const scenarios: Scenario[] = [
  {
    name: 'blade',
    crawls: { admin: 'blade-admin.json', user: 'blade-user.json' },
    config: {
      baseUrl: 'http://127.0.0.1:8000',
      hooks: { reset: { method: 'POST', path: '/__testing/reset' } },
      oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
      auth: {
        loginPath: '/login',
        roles: [
          { name: 'admin', username: 'admin@example.com', password: 'password' },
          { name: 'user', username: 'user@example.com', password: 'password' },
        ],
      },
      data: {
        fields: { title: 'Buy groceries', body: 'Milk, eggs, bread', contact_email: 'contact@example.com', due_date: '2026-06-15', email: 'user@example.com' },
        defaults: { text: 'Sample', email: 'user@example.com', number: '1', date: '2026-06-15' },
        unique: ['contact_email'],
        duplicates: { contact_email: 'admin.todo.01@example.com' },
        confirmFields: ['contact_email_confirmation'],
        faker: { locale: 'en', seed: 42 },
      },
    },
  },
  {
    name: 'saucedemo',
    crawls: { standard_user: 'saucedemo-standard_user.json' },
    config: {
      baseUrl: 'https://www.saucedemo.com',
      oracle: { errorSelector: '[data-test="error"]' },
      auth: { loginPath: '/', roles: [{ name: 'standard_user', username: 'standard_user', password: 'secret_sauce' }] },
      crawl: { maxDepth: 3, maxPages: 50, include: ['/inventory.html', '/cart.html'], exclude: [] },
      data: {
        fields: { firstName: 'Jane', lastName: 'Doe', postalCode: '12345' },
        defaults: { text: 'Sample' },
        requiredFields: ['firstName', 'lastName', 'postalCode'],
        faker: { locale: 'en', seed: null },
      },
    },
  },
];

async function filesUnder(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile())) {
    const full = join(entry.parentPath, entry.name);
    out[full.slice(dir.length + 1)] = await readFile(full, 'utf8');
  }
  return out;
}

describe.each(scenarios)('golden generation: $name', (scenario) => {
  it('emits the recorded suite byte for byte', async () => {
    const work = await mkdtemp(join(tmpdir(), 'tt-golden-'));
    try {
      const crawlDir = join(work, 'crawl');
      await mkdir(crawlDir);
      for (const [role, file] of Object.entries(scenario.crawls)) {
        await copyFile(join(fixtures, 'crawls', file), join(crawlDir, `${role}.json`));
      }
      const outDir = join(work, 'generated');
      const config = parseConfig({ ...(scenario.config as object), output: { dir: outDir, language: 'ts' } });
      const crawls = await loadCrawls(crawlDir, config.auth.roles.map((role) => role.name));
      await emit(mapTestCases(crawls, buildAccessMatrix(crawls), config), config);

      const actual = await filesUnder(outDir);
      const goldenDir = join(fixtures, 'golden', scenario.name);
      if (process.env.UPDATE_GOLDEN) {
        await rm(goldenDir, { recursive: true, force: true });
        for (const [path, text] of Object.entries(actual)) {
          await mkdir(dirname(join(goldenDir, path)), { recursive: true });
          await writeFile(join(goldenDir, path), text);
        }
        return;
      }
      const expected = await filesUnder(goldenDir);
      expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
      for (const path of Object.keys(expected)) {
        expect(actual[path], path).toBe(expected[path]);
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
