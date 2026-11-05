import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FAULT_CATALOGUE } from '../src/eval/faults.js';

/**
 * A catalogue fault whose id has no `FaultRegistry::is('<id>')` call in a case study can never be
 * detected, and a toggle with no catalogue entry is dead weight. Keep the two sets identical.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'case-study');

async function phpFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return phpFiles(full);
    return entry.name.endsWith('.php') ? [full] : [];
  }));
  return nested.flat();
}

async function toggleIds(app: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const file of await phpFiles(join(root, app, 'app'))) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/FaultRegistry::is\('([a-z0-9_]+)'/g)) ids.add(match[1] ?? '');
  }
  return [...ids].sort();
}

describe('fault catalogue vs case-study toggles', () => {
  const catalogueIds = FAULT_CATALOGUE.map((fault) => fault.id).sort();

  it.each(['todo-blade', 'todo-inertia-react'])('%s toggles exactly the catalogue ids', async (app) => {
    expect(await toggleIds(app)).toEqual(catalogueIds);
  });
});
