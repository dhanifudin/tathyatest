import { describe, expect, it } from 'vitest';
import { mapTestCases } from '../src/mapper.js';
import type { CrawlOutput } from '../src/crawl.js';
import type { TathyaConfig } from '../src/config.js';
import type { AccessMatrix } from '../src/rbac.js';

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
  data: {
    fields: { contact_email: 'contact@example.com' },
    defaults: { text: 'Sample', email: 'user@example.com', number: '1', date: '2026-06-15' },
    unique: ['contact_email'],
    duplicates: { contact_email: 'admin.todo@example.com' },
    requiredFields: ['status'],
    confirmFields: [],
  },
};

describe('mapTestCases', () => {
  it('keeps confirmation fields aligned in the base form payload', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'static',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/todos/create',
          title: 'Create Todo',
          forms: [
            {
              action: '/todos',
              method: 'POST',
              crudOp: 'create',
              noValidate: true,
              fields: [
                {
                  name: 'contact_email',
                  type: 'email',
                  label: 'Contact email',
                  required: true,
                  constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: null,
                  nameHints: [],
                  locator: { strategy: 'label', value: 'Contact email' },
                },
                {
                  name: 'contact_email_confirmation',
                  type: 'email',
                  label: 'Confirm contact email',
                  required: true,
                  constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: null,
                  nameHints: ['confirmation'],
                  locator: { strategy: 'label', value: 'Confirm contact email' },
                },
                {
                  name: 'status',
                  type: 'select',
                  label: 'Status',
                  required: true,
                  constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: [
                    { value: 'open', label: 'Open' },
                    { value: 'doing', label: 'Doing' },
                    { value: 'done', label: 'Done' },
                  ],
                  nameHints: [],
                  locator: { strategy: 'label', value: 'Status' },
                },
              ],
              submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };
    const matrix: AccessMatrix = new Map([
      ['/todos/create', { route: '/todos/create', reachableBy: ['admin'] }],
    ]);

    const cases = mapTestCases([crawl], matrix, config);
    const valid = cases.find((testCase) => testCase.kind === 'form' && testCase.variant.name === 'valid');
    const mismatch = cases.find((testCase) => testCase.kind === 'form' && testCase.variant.name === 'confirmation-mismatch');

    expect(valid?.values.contact_email).toBe('contact@example.com');
    expect(valid?.values.contact_email_confirmation).toBe('contact@example.com');
    expect(valid?.values.status).toBe('open');
    expect(mismatch?.values.contact_email).toBe('contact@example.com');
    expect(mismatch?.values.contact_email_confirmation).toBe('contact@example.com-mismatch');
  });

  it('emits blank negatives for configured required fields', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'static',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/todos/create',
          title: 'Create Todo',
          forms: [
            {
              action: '/todos',
              method: 'POST',
              crudOp: 'create',
              noValidate: true,
              fields: [
                {
                  name: 'status',
                  type: 'select',
                  label: 'Status',
                  required: false,
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
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };
    const matrix: AccessMatrix = new Map([
      ['/todos/create', { route: '/todos/create', reachableBy: ['admin'] }],
    ]);

    const cases = mapTestCases([crawl], matrix, config);
    const blank = cases.find((testCase) => testCase.kind === 'form' && testCase.variant.name === 'required-empty');

    expect(blank?.targetField?.name).toBe('status');
    expect(blank?.values.status).toBe('');
  });

  it('maps non-CRUD forms and page interactions', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/inventory.html',
          title: 'Inventory',
          forms: [
            {
              action: '/search',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: false,
              fields: [
                {
                  name: 'q',
                  type: 'search',
                  label: 'Search',
                  required: false,
                  constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: null,
                  nameHints: [],
                  locator: { strategy: 'label', value: 'Search' },
                },
              ],
              submit: { text: 'Search', locator: { strategy: 'role', value: 'button:Search' } },
            },
          ],
          links: [
            { href: '/cart.html', text: 'Cart', locator: { strategy: 'role', value: 'link:Cart' } },
          ],
          buttons: [
            { text: 'Add to cart', locator: { strategy: 'role', value: 'button:Add to cart' } },
            { text: 'Add to cart', locator: { strategy: 'role', value: 'button:Add to cart' } },
          ],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const form = cases.find((testCase) => testCase.kind === 'form' && testCase.variant.name === 'valid');
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    expect(form?.title).toBe('admin /inventory.html form - valid -> success');
    expect(interactions).toHaveLength(3);
    expect(interactions.map((testCase) => testCase.interaction.ordinal)).toEqual([0, 0, 1]);
    expect(interactions.map((testCase) => testCase.title)).toEqual([
      'admin /inventory.html link Cart -> handled',
      'admin /inventory.html button Add to cart #1 -> handled',
      'admin /inventory.html button Add to cart #2 -> handled',
    ]);
  });

  it('does not synthesize Sauce Demo routes when they are absent from crawl output', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/catalog',
          title: 'Catalog',
          forms: [],
          links: [
            { href: '/cart', text: 'Cart', locator: { strategy: 'role', value: 'link:Cart' } },
          ],
          buttons: [
            { text: 'Add', locator: { strategy: 'role', value: 'button:Add' } },
          ],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const serialized = JSON.stringify(cases);

    expect(serialized).toContain('/catalog');
    expect(serialized).toContain('/cart');
    expect(serialized).not.toContain('/inventory.html');
    expect(serialized).not.toContain('Add to cart');
    expect(cases.filter((testCase) => testCase.kind === 'interaction')).toHaveLength(2);
  });

  it('deduplicates query-only page routes and keeps generated titles unique', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/inventory.html?sort=az',
          title: 'Inventory',
          forms: [],
          links: [
            { href: '/inventory.html?item=1', text: '', locator: { strategy: 'id', value: 'item_1_img_link' } },
            { href: '/inventory.html?item=2', text: '', locator: { strategy: 'id', value: 'item_2_img_link' } },
          ],
          buttons: [
            { text: 'Add to cart', locator: { strategy: 'role', value: 'button:Add to cart' } },
            { text: 'Add to cart', locator: { strategy: 'role', value: 'button:Add to cart' } },
          ],
          tables: [],
        },
        {
          url: '/inventory.html?sort=za',
          title: 'Inventory',
          forms: [],
          links: [
            { href: '/inventory.html?item=3', text: '', locator: { strategy: 'id', value: 'item_3_img_link' } },
          ],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const titles = cases.map((testCase) => testCase.title);
    const rbacAllowed = cases.filter((testCase) => testCase.kind === 'rbac' && testCase.expectAllowed);
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    expect(rbacAllowed).toHaveLength(1);
    expect(rbacAllowed[0].route).toBe('/inventory.html');
    expect(interactions.map((testCase) => testCase.title)).toEqual([
      'admin /inventory.html link /inventory.html #1 -> handled',
      'admin /inventory.html link /inventory.html #2 -> handled',
      'admin /inventory.html button Add to cart #1 -> handled',
      'admin /inventory.html button Add to cart #2 -> handled',
    ]);
    expect(new Set(titles).size).toBe(titles.length);
    expect(JSON.stringify(cases)).not.toContain('sort=za');
  });
});
