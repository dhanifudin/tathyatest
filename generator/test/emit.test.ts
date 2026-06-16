import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitTs } from '../src/emit/ts.js';
import type { TathyaConfig } from '../src/config.js';
import type { TestCase } from '../src/mapper.js';

const config: TathyaConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  extractor: { engine: 'static' },
  output: { dir: '', language: 'ts' },
  coverage: 'all',
  oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
  auth: {
    loginPath: '/login',
    usernameField: 'email',
    passwordField: 'password',
    roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
  },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
  data: { fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [] },
};

describe('emitTs', () => {
  it('emits auth specs without using role storage state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        output: { ...config.output, dir },
      };
      const cases: TestCase[] = [
        {
          kind: 'auth',
          tier: 'positive',
          title: 'login admin valid -> success',
          role: 'admin',
          username: 'admin@example.com',
          password: 'password',
          expectSuccess: true,
        },
      ];

      await emitTs(cases, localConfig);
      const authSpec = await readFile(join(dir, 'auth', 'auth.spec.ts'), 'utf8');

      expect(authSpec).toContain('test.use({ storageState: { cookies: [], origins: [] } });');
      expect(authSpec).toContain('await page.goto("/login");');
      expect(authSpec).not.toContain('storageState/admin.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('forces invalid select values through a temporary option', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        output: { ...config.output, dir },
      };
      const cases: TestCase[] = [
        {
          kind: 'crud',
          tier: 'negative',
          title: 'admin /todos create - status invalid-option -> error',
          role: 'admin',
          page: {
            url: '/todos/create',
            title: 'Create Todo',
            forms: [],
            links: [],
            buttons: [],
            tables: [],
          },
          form: {
            action: '/todos',
            method: 'POST',
            crudOp: 'create',
            noValidate: true,
            fields: [
              {
                name: 'status',
                type: 'select',
                label: 'Status',
                required: true,
                constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                options: [
                  { value: 'open', label: 'Open' },
                  { value: 'doing', label: 'Doing' },
                ],
                nameHints: [],
                locator: { strategy: 'label', value: 'Status' },
              },
            ],
            submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
          },
          targetField: {
            name: 'status',
            type: 'select',
            label: 'Status',
            required: true,
            constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
            options: [
              { value: 'open', label: 'Open' },
              { value: 'doing', label: 'Doing' },
            ],
            nameHints: [],
            locator: { strategy: 'label', value: 'Status' },
          },
          variant: { kind: 'negative', name: 'invalid-option', value: '__invalid_option__', outcome: 'error', forceInvalidOption: true },
          values: { status: '__invalid_option__' },
        },
      ];

      await emitTs(cases, localConfig);
      const crudSpec = await readFile(join(dir, 'crud', 'crud.spec.ts'), 'utf8');

      expect(crudSpec).toContain('HTMLSelectElement');
      expect(crudSpec).toContain('document.createElement(\'option\')');
      expect(crudSpec).toContain('element.value = value;');
      expect(crudSpec).not.toContain('selectOption("__invalid_option__")');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('clears required selects and radio groups for blank negatives', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        output: { ...config.output, dir },
      };
      const cases: TestCase[] = [
        {
          kind: 'crud',
          tier: 'negative',
          title: 'admin /todos create - status required-empty -> error',
          role: 'admin',
          page: {
            url: '/todos/create',
            title: 'Create Todo',
            forms: [],
            links: [],
            buttons: [],
            tables: [],
          },
          form: {
            action: '/todos',
            method: 'POST',
            crudOp: 'create',
            noValidate: true,
            fields: [
              {
                name: 'status',
                type: 'select',
                label: 'Status',
                required: true,
                constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                options: [
                  { value: 'open', label: 'Open' },
                  { value: 'doing', label: 'Doing' },
                ],
                nameHints: [],
                locator: { strategy: 'label', value: 'Status' },
              },
            ],
            submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
          },
          targetField: {
            name: 'status',
            type: 'select',
            label: 'Status',
            required: true,
            constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
            options: [
              { value: 'open', label: 'Open' },
              { value: 'doing', label: 'Doing' },
            ],
            nameHints: [],
            locator: { strategy: 'label', value: 'Status' },
          },
          variant: { kind: 'negative', name: 'required-empty', value: '', outcome: 'error' },
          values: { status: '' },
        },
        {
          kind: 'crud',
          tier: 'negative',
          title: 'admin /todos create - choice required-empty -> error',
          role: 'admin',
          page: {
            url: '/todos/create',
            title: 'Create Todo',
            forms: [],
            links: [],
            buttons: [],
            tables: [],
          },
          form: {
            action: '/todos',
            method: 'POST',
            crudOp: 'create',
            noValidate: true,
            fields: [
              {
                name: 'choice',
                type: 'radio',
                label: 'Choice',
                required: true,
                constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                options: [
                  { value: 'one', label: 'One' },
                  { value: 'two', label: 'Two' },
                ],
                nameHints: [],
                locator: { strategy: 'label', value: 'Choice' },
              },
            ],
            submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
          },
          targetField: {
            name: 'choice',
            type: 'radio',
            label: 'Choice',
            required: true,
            constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
            options: [
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
            ],
            nameHints: [],
            locator: { strategy: 'label', value: 'Choice' },
          },
          variant: { kind: 'negative', name: 'required-empty', value: '', outcome: 'error' },
          values: { choice: '' },
        },
      ];

      await emitTs(cases, localConfig);
      const crudSpec = await readFile(join(dir, 'crud', 'crud.spec.ts'), 'utf8');

      expect(crudSpec).toContain('selectedIndex = -1');
      expect(crudSpec).toContain('evaluateAll((elements) =>');
      expect(crudSpec).toContain('element.checked = false;');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
