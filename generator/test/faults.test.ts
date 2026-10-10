import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAULT_CATALOGUE, faultSpecsFromFile, faultsForClasses, loadFaultCatalogue, mergeCatalogues, relevantFromMatcher } from '../src/eval/faults.js';
import type { ManifestEntry } from '../src/manifest.js';

const entry: ManifestEntry = {
  id: 't0001', title: 'admin creates a todo', category: 'crud', tier: 'negative', role: 'admin',
  route: '/todos/create', targetForm: 'POST:/todos', targetField: 'contact_email', constraintKind: 'type',
  assertionCount: 1, locatorStrategy: 'label', faultClass: 'validation', mutating: true,
};

describe('relevantFromMatcher', () => {
  it('matches on every given field and ignores the rest', () => {
    expect(relevantFromMatcher({ category: 'crud' })(entry)).toBe(true);
    expect(relevantFromMatcher({ category: 'crud', tier: 'negative', constraintKind: 'type' })(entry)).toBe(true);
    expect(relevantFromMatcher({ category: 'crud', targetFieldIncludes: 'email' })(entry)).toBe(true);
    expect(relevantFromMatcher({ category: 'crud', targetField: 'title' })(entry)).toBe(false);
    expect(relevantFromMatcher({ category: 'rbac' })(entry)).toBe(false);
    expect(relevantFromMatcher({ category: 'crud', faultClass: 'crud' })(entry)).toBe(false);
  });
});

describe('fault catalogue files', () => {
  it('merges a project catalogue over the built-in one by id', () => {
    const extra = faultSpecsFromFile([
      { id: 'validation_title_required', faultClass: 'validation', description: 'replaced', relevant: { category: 'crud', targetField: 'name' } },
      { id: 'shop_discount_wrong', faultClass: 'crud', description: 'new', relevant: { category: 'crud', tier: 'positive' } },
    ]);
    const merged = mergeCatalogues(FAULT_CATALOGUE, extra);

    expect(merged).toHaveLength(FAULT_CATALOGUE.length + 1);
    expect(merged.find((fault) => fault.id === 'validation_title_required')?.description).toBe('replaced');
    expect(merged.at(-1)?.id).toBe('shop_discount_wrong');
    expect(faultsForClasses(['crud'], merged).map((fault) => fault.id)).toEqual(['crud_skip_persist', 'crud_delete_noop', 'crud_toggle_noop', 'search_filter_ignored', 'shop_discount_wrong']);
  });

  it('loads and validates a JSON catalogue file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-faults-'));
    try {
      const path = join(dir, 'faults.json');
      await writeFile(path, JSON.stringify([
        { id: 'auth_accept_any', faultClass: 'auth', relevant: { category: 'auth', tier: 'negative' } },
      ]));

      const catalogue = await loadFaultCatalogue(path);

      expect(catalogue).toHaveLength(FAULT_CATALOGUE.length);
      expect(catalogue.find((fault) => fault.id === 'auth_accept_any')?.description).toBe('');
      await expect(loadFaultCatalogue(undefined)).resolves.toBe(FAULT_CATALOGUE);

      await writeFile(path, JSON.stringify([{ id: 'x', faultClass: 'nope', relevant: { category: 'crud' } }]));
      await expect(loadFaultCatalogue(path)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('negative controls and per-fault reporting', () => {
  it('marks exactly the controls as expected survivors and matches titles', () => {
    const controls = FAULT_CATALOGUE.filter((fault) => fault.expected === 'survives').map((fault) => fault.id);
    expect(controls).toEqual(['validation_date_rule_drop', 'validation_body_string_drop', 'validation_message_text_changed', 'search_filter_ignored']);
    expect(FAULT_CATALOGUE).toHaveLength(18);
    expect(new Set(FAULT_CATALOGUE.map((fault) => fault.id)).size).toBe(18);
    expect(relevantFromMatcher({ category: 'crud', titleIncludes: 'deletes the record' })({ ...entry, title: 'a · deletes the record' })).toBe(true);
    expect(relevantFromMatcher({ category: 'crud', titleIncludes: 'deletes the record' })(entry)).toBe(false);
  });

  it('splits detectable faults from controls in the metrics', async () => {
    const { faultMetricsOf } = await import('../src/metrics.js');
    const failed = [{ title: 't', project: 'p', status: 'failed' as const, durationMs: 1 }];
    const passed = [{ title: 't', project: 'p', status: 'passed' as const, durationMs: 1 }];
    const m = faultMetricsOf([
      { id: 'a', faultClass: 'crud', outcomes: failed },
      { id: 'b', faultClass: 'crud', outcomes: passed },
      { id: 'c', faultClass: 'validation', expected: 'survives', outcomes: passed },
    ]);
    expect(m.killed).toBe(1);
    expect(m.detectable).toEqual({ total: 2, killed: 1, score: 0.5 });
    expect(m.controls).toEqual({ total: 1, survived: 1 });
    expect(m.perFault.map((row) => [row.id, row.killed, row.expected])).toEqual([['a', true, 'detected'], ['b', false, 'detected'], ['c', false, 'survives']]);
  });
});
