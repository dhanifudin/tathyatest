import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adapterFor } from '../../src/adapters/registry.js';
import { FRAMEWORKS } from '../../src/adapters/types.js';
import { parseConfig, type TathyaConfig } from '../../src/config.js';
import { loadCrawls } from '../../src/crawl/crawl.js';
import { analyzeSpecSource } from '../../src/adapters/playwright/analyze.js';
import { playwrightEmitter } from '../../src/adapters/playwright/emitter.js';
import { manifestFor } from '../../src/emit/index.js';
import { mapTestCases } from '../../src/generate/mapper.js';
import { buildAccessMatrix } from '../../src/generate/rbac.js';
import { planFor } from '../../src/ir/build.js';
import { tagsAndAnnotations } from '../../src/ir/layout.js';
import type { TestCase } from '../../src/generate/test-case.js';

/**
 * Conformance suite (PRD 6): every registered adapter must emit, from the same IR, one test per
 * manifest entry under its exact title and tags, and no assertion on message text.
 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'crawls');
const bladeConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  hooks: { reset: { method: 'POST', path: '/__testing/reset' } },
  oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
  auth: { roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }, { name: 'user', username: 'user@example.com', password: 'password' }] },
  data: { fields: { title: 'Buy groceries', contact_email: 'contact@example.com' }, unique: ['contact_email'], duplicates: { contact_email: 'admin.todo.01@example.com' }, confirmFields: ['contact_email_confirmation'] },
};

let work: string;
let cases: TestCase[];
let config: TathyaConfig;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'tt-conformance-'));
  await mkdir(join(work, 'crawl'));
  for (const role of ['admin', 'user']) await copyFile(join(fixtures, `blade-${role}.json`), join(work, 'crawl', `${role}.json`));
  config = parseConfig(bladeConfig);
  const crawls = await loadCrawls(join(work, 'crawl'), ['admin', 'user']);
  cases = mapTestCases(crawls, buildAccessMatrix(crawls), config);
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('IR ↔ manifest', () => {
  it('records as many assertions as the static analyser counts in the emitted Playwright specs', () => {
    const manifest = manifestFor(cases, config);
    const files = playwrightEmitter.files(cases.map((testCase) => planFor(testCase, config)), config);
    const emitted = [...files].filter(([path]) => !path.startsWith('support/')).reduce((sum, [, source]) => sum + analyzeSpecSource(source).assertions, 0);
    expect(manifest.reduce((sum, entry) => sum + entry.assertionCount, 0)).toBe(emitted);
    expect(manifest.every((entry) => entry.assertionCount > 0)).toBe(true);
  });
});

describe.each(FRAMEWORKS)('adapter conformance: %s', (framework) => {
  const leaf = framework === 'playwright' ? 'test' : 'it';
  const tagKey = framework === 'playwright' ? 'tag' : 'tags';

  it('emits every manifest title exactly once, with its manifest tags', () => {
    const files = adapterFor(framework).emitter.files(cases.map((testCase) => planFor(testCase, config)), config);
    const specs = [...files].filter(([path]) => !path.startsWith('support/')).map(([, source]) => source).join('\n');
    const titles = new Set(cases.map((testCase) => testCase.title));
    expect(titles.size).toBe(cases.length);
    for (const testCase of cases) {
      const header = `${leaf}(${JSON.stringify(testCase.title)}, { ${tagKey}: ${JSON.stringify(tagsAndAnnotations(testCase).tags)}`;
      expect(specs.split(header).length - 1, testCase.title).toBe(1);
    }
  });

  it('never asserts on message text', () => {
    const files = adapterFor(framework).emitter.files(cases.map((testCase) => planFor(testCase, config)), config);
    for (const [path, source] of files) {
      if (path.startsWith('support/')) continue;
      expect(source, path).not.toMatch(/toHaveText\(|have\.text|contain\.text|toContainText\("/);
    }
  });
});
