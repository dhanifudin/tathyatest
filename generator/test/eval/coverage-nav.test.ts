import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crawlOutputSchema } from '../../src/crawl/model.js';
import { buildManifest } from '../../src/generate/manifest.js';
import { mapTestCases } from '../../src/generate/mapper.js';
import { buildAccessMatrix } from '../../src/generate/rbac.js';
import { coverageMetrics } from '../../src/eval/metrics/coverage.js';
import { makeConfig } from '../helpers/fixtures.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'crawls');

/**
 * Regression for the Blade navigation gap that was read as "17 of 19": the logout link beside a logout form
 * is the auth logout scenario, so it must leave the navigation denominator, and matching is by scenario key.
 */
describe('navigation coverage on the recorded Blade crawl', () => {
  it('has no phantom logout scenario and covers every navigation scenario by key', async () => {
    const crawls = await Promise.all(['blade-admin.json', 'blade-user.json'].map(async (file) => crawlOutputSchema.parse(JSON.parse(await readFile(join(fixtures, file), 'utf8')))));
    const config = makeConfig({
      auth: { loginPath: '/login', roles: [{ name: 'admin', username: 'a', password: 'b' }, { name: 'user', username: 'c', password: 'd' }] },
    });
    const cases = mapTestCases(crawls, buildAccessMatrix(crawls), config);
    const manifest = buildManifest(cases);
    const metrics = coverageMetrics({ config, manifest, crawls, matrix: buildAccessMatrix(crawls) } as never);

    expect(metrics.nav.total).toBeGreaterThan(0);
    expect(metrics.nav.covered).toBe(metrics.nav.total);
    expect(manifest.some((entry) => entry.category === 'nav' && entry.scenarioKey === 'link:/logout')).toBe(false);
  });

  it('does not let a surplus test hide a missing scenario', async () => {
    const crawls = await Promise.all(['blade-admin.json'].map(async (file) => crawlOutputSchema.parse(JSON.parse(await readFile(join(fixtures, file), 'utf8')))));
    const config = makeConfig();
    const manifest = buildManifest(mapTestCases(crawls, buildAccessMatrix(crawls), config));
    const withoutOneNav = manifest.filter((entry, index) => !(entry.category === 'nav' && index === manifest.findIndex((e) => e.category === 'nav')));
    const surplus = [...withoutOneNav, { ...manifest.find((entry) => entry.category === 'nav')!, id: 'tx', title: 'surplus', scenarioKey: 'link:/not-a-real-scenario' }];
    const metrics = coverageMetrics({ config, manifest: surplus, crawls, matrix: buildAccessMatrix(crawls) } as never);
    expect(metrics.nav.covered).toBeLessThan(metrics.nav.total);
  });
});

describe('probed fields, exercised CRUD and declared routes on the recorded Blade crawl', () => {
  it('separates filling a field from probing it and measures the app declared routes', async () => {
    const crawls = await Promise.all(['blade-admin.json', 'blade-user.json'].map(async (file) => crawlOutputSchema.parse(JSON.parse(await readFile(join(fixtures, file), 'utf8')))));
    const config = makeConfig({
      auth: { loginPath: '/login', roles: [{ name: 'admin', username: 'a', password: 'b' }, { name: 'user', username: 'c', password: 'd' }] },
      evaluation: { expectedRoutes: ['/', '/login', '/dashboard', '/admin/users', '/todos', '/todos/create', '/todos/:id/edit', '/never-routed'] },
    });
    const manifest = buildManifest(mapTestCases(crawls, buildAccessMatrix(crawls), config));
    const metrics = coverageMetrics({ config, manifest, crawls, matrix: buildAccessMatrix(crawls) } as never);

    expect(metrics.fieldsProbed.total).toBe(metrics.fields.total);
    expect(metrics.fieldsProbed.covered).toBeGreaterThan(0);
    expect(metrics.fieldsProbed.covered).toBeLessThanOrEqual(metrics.fields.covered);
    expect(metrics.declaredRoutes).toEqual({ covered: 7, total: 8, ratio: 7 / 8 });
    expect(metrics.crudExercisedByResource.todos).toMatchObject({ create: true, update: true, read: true });
  });
});
