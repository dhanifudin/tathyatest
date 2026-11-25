import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config.js';
import { emit } from '../../src/emit/index.js';
import type { TestCase } from '../../src/generate/test-case.js';

const cases: TestCase[] = [
  { kind: 'rbac', tier: 'positive', title: 'admin can open /todos', role: 'admin', route: '/todos', expectAllowed: true },
  { kind: 'auth', tier: 'negative', title: 'admin is rejected with a wrong password', role: 'admin', username: 'admin@example.com', password: 'nope', expectSuccess: false },
];

/** Every path under `dir`, `/`-separated on every platform. */
async function listing(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true })).map((entry) => entry.replaceAll('\\', '/')).sort();
}

describe('emit', () => {
  it('writes the suite in the configured language plus the manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-index-'));
    try {
      const base = parseConfig({ baseUrl: 'http://127.0.0.1:8000', auth: { roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }] }, output: { dir } });

      await emit(cases, base);
      expect(await listing(dir)).toEqual(['auth', 'auth/login.spec.ts', 'manifest.json', 'rbac', 'rbac/todos.spec.ts', 'support', 'support/tathya.ts']);
      const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as Array<Record<string, unknown>>;
      expect(manifest.map((entry) => [entry.id, entry.category, entry.mutating])).toEqual([['t0001', 'rbac', false], ['t0002', 'auth', true]]);

      await emit(cases, { ...base, output: { ...base.output, language: 'js' } });
      expect(await listing(dir)).toEqual(['auth', 'auth/login.spec.js', 'manifest.json', 'rbac', 'rbac/todos.spec.js', 'support', 'support/tathya.js']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes the Cypress suite and the same manifest for framework: cypress', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-cypress-'));
    try {
      const base = parseConfig({ baseUrl: 'http://127.0.0.1:8000', auth: { roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }] }, output: { dir, framework: 'cypress' } });
      const manifest = await emit(cases, base);
      expect(await listing(dir)).toEqual(['auth', 'auth/login.cy.ts', 'manifest.json', 'rbac', 'rbac/todos.cy.ts', 'support', 'support/e2e.ts', 'support/tathya.ts']);
      expect(manifest).toEqual(await emit(cases, { ...base, output: { ...base.output, framework: 'playwright' } }));

      await emit(cases, { ...base, output: { ...base.output, language: 'js' } });
      expect(await listing(dir)).toEqual(['auth', 'auth/login.cy.js', 'manifest.json', 'rbac', 'rbac/todos.cy.js', 'support', 'support/e2e.js', 'support/tathya.js']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
