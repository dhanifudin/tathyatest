import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitJs } from '../src/emit/js.js';
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
      expect(authSpec).toContain('async function inferLoginControls');
      expect(authSpec).toContain('await performLogin(page, "admin@example.com", "password");');
      expect(authSpec).not.toContain('loginSelectors');
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
          kind: 'form',
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
      const formsSpec = await readFile(join(dir, 'forms', 'forms.spec.ts'), 'utf8');

      expect(formsSpec).toContain('HTMLSelectElement');
      expect(formsSpec).toContain('document.createElement(\'option\')');
      expect(formsSpec).toContain('element.value = value;');
      expect(formsSpec).not.toContain('selectOption("__invalid_option__")');
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
          kind: 'form',
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
          kind: 'form',
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
      const formsSpec = await readFile(join(dir, 'forms', 'forms.spec.ts'), 'utf8');

      expect(formsSpec).toContain('selectedIndex = -1');
      expect(formsSpec).toContain('evaluateAll((elements) =>');
      expect(formsSpec).toContain('element.checked = false;');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits interaction specs with duplicate locator ordinals and generic login success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        output: { ...config.output, dir },
      };
      const cases: TestCase[] = [
        {
          kind: 'interaction',
          tier: 'positive',
          title: 'admin /inventory.html button Add to cart -> handled',
          role: 'admin',
          page: {
            url: '/inventory.html',
            title: 'Inventory',
            forms: [],
            links: [],
            buttons: [],
            tables: [],
          },
          interaction: {
            type: 'button',
            label: 'Add to cart',
            locator: { strategy: 'role', value: 'button:Add to cart' },
            ordinal: 1,
          },
        },
      ];

      await emitTs(cases, localConfig);
      const interactionsSpec = await readFile(join(dir, 'interactions', 'interactions.spec.ts'), 'utf8');

      expect(interactionsSpec).toContain('page.getByRole("button", { name: "Add to cart" }).nth(1)');
      expect(interactionsSpec).toContain('.nth(1)');
      expect(interactionsSpec).toContain('interaction target is not visible');
      expect(interactionsSpec).toContain('await assertLoginSucceeded(page);');
      expect(interactionsSpec).not.toContain('/dashboard');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits JavaScript specs in the forms and interactions folders', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tt-emit-js-'));
    try {
      const localConfig: TathyaConfig = {
        ...config,
        output: { ...config.output, dir, language: 'js' },
      };
      const cases: TestCase[] = [
        {
          kind: 'interaction',
          tier: 'positive',
          title: 'admin /inventory.html link Cart -> handled',
          role: 'admin',
          page: {
            url: '/inventory.html',
            title: 'Inventory',
            forms: [],
            links: [],
            buttons: [],
            tables: [],
          },
          interaction: {
            type: 'link',
            label: 'Cart',
            locator: { strategy: 'role', value: 'link:Cart' },
            ordinal: 0,
            href: '/cart.html',
          },
        },
      ];

      await emitJs(cases, localConfig);

      const formsSpec = await readFile(join(dir, 'forms', 'forms.spec.js'), 'utf8');
      const interactionsSpec = await readFile(join(dir, 'interactions', 'interactions.spec.js'), 'utf8');

      expect(formsSpec).toContain("from '@playwright/test'");
      expect(formsSpec).not.toContain('type LoginLocator');
      expect(interactionsSpec).toContain('page.getByRole("link", { name: "Cart" }).nth(0)');
      expect(interactionsSpec).not.toContain("import('@playwright/test').Page");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
