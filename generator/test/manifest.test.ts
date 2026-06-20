import { describe, expect, it } from 'vitest';
import { buildManifest } from '../src/manifest.js';
import type { TestCase } from '../src/mapper.js';

const field = {
  name: 'title',
  type: 'text',
  label: 'Title',
  required: true,
  constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
  options: null,
  nameHints: [] as string[],
  locator: { strategy: 'label' as const, value: 'Title' },
};
const form = {
  action: '/todos',
  method: 'POST' as const,
  crudOp: 'create' as const,
  noValidate: true,
  fields: [field],
  submit: { text: 'Create', locator: { strategy: 'role' as const, value: 'button:Create' } },
};
const page = { url: '/todos/create', title: 'Create', forms: [], links: [], buttons: [], tables: [] };

describe('buildManifest', () => {
  it('derives category, tier, fault class, and constraint kind per test', () => {
    const cases: TestCase[] = [
      { kind: 'auth', tier: 'positive', title: 'login admin valid -> success', role: 'admin', username: 'a', password: 'b', expectSuccess: true },
      { kind: 'form', tier: 'positive', title: 'create valid', role: 'admin', page, form, targetField: null, variant: { kind: 'positive', name: 'valid', value: '', outcome: 'success' }, values: {} },
      { kind: 'form', tier: 'negative', title: 'create title required', role: 'admin', page, form, targetField: field, variant: { kind: 'negative', name: 'required-empty', value: '', outcome: 'error' }, values: {} },
      { kind: 'rbac', tier: 'negative', title: 'user blocked', role: 'user', route: '/admin/users', expectAllowed: false },
    ];

    const manifest = buildManifest(cases);
    expect(manifest).toHaveLength(4);
    expect(manifest.map((entry) => entry.category)).toEqual(['auth', 'crud', 'crud', 'rbac']);
    expect(manifest.map((entry) => entry.faultClass)).toEqual(['auth', 'crud', 'validation', 'authz']);
    expect(manifest[2].constraintKind).toBe('required');
    expect(manifest[2].targetField).toBe('title');
    expect(manifest[2].route).toBe('/todos/create');
    expect(manifest[3].route).toBe('/admin/users');
    expect(new Set(manifest.map((entry) => entry.id)).size).toBe(4);
  });
});
