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

    expect(form?.title).toBe('admin /inventory.html form [action /search; method GET; submit Search; fields q] - valid -> success');
    expect(interactions).toHaveLength(2);
    expect(interactions.map((testCase) => testCase.interaction.ordinal)).toEqual([0, 0]);
    expect(interactions.map((testCase) => testCase.title)).toEqual([
      'admin /inventory.html link /cart.html -> handled',
      'admin /inventory.html button Add to cart -> handled',
    ]);
  });

  it('keeps multiple forms on the same page distinct by signature', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/basket',
          title: 'Basket',
          forms: [
            {
              action: '/basket',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: false,
              fields: [],
              submit: { text: 'Redeem', locator: { strategy: 'role', value: 'button:Redeem' } },
            },
            {
              action: '/basket',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: true,
              fields: [],
              submit: { text: 'Continue to checkout', locator: { strategy: 'role', value: 'button:Continue to checkout' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const formTitles = cases.filter((testCase) => testCase.kind === 'form').map((testCase) => testCase.title);

    expect(formTitles).toEqual([
      'admin /basket form [action /basket; method GET; submit Redeem] -> success',
      'admin /basket form [action /basket; method GET; submit Continue to checkout] -> success',
    ]);
    expect(new Set(formTitles).size).toBe(formTitles.length);
  });

  it('deduplicates identical form signatures on the same route shape', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/basket',
          title: 'Basket',
          forms: [
            {
              action: '/basket',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: false,
              fields: [],
              submit: { text: 'Checkout', locator: { strategy: 'role', value: 'button:Checkout' } },
            },
            {
              action: '/basket',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: false,
              fields: [],
              submit: { text: 'Checkout', locator: { strategy: 'role', value: 'button:Checkout' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const formTitles = cases.filter((testCase) => testCase.kind === 'form').map((testCase) => testCase.title);

    expect(formTitles).toEqual([
      'admin /basket form [action /basket; method GET; submit Checkout] -> success',
    ]);
    expect(new Set(formTitles).size).toBe(formTitles.length);
  });

  it('does not emit form submit buttons as generic interactions', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/todos',
          title: 'Todos',
          forms: [
            {
              action: '/todos',
              method: 'GET',
              crudOp: 'unknown',
              noValidate: false,
              fields: [
                {
                  name: 'search',
                  type: 'search',
                  label: 'Search todos',
                  required: false,
                  constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: null,
                  nameHints: [],
                  locator: { strategy: 'label', value: 'Search todos' },
                },
              ],
              submit: { text: 'Apply', locator: { strategy: 'role', value: 'button:Apply' } },
            },
          ],
          links: [],
          buttons: [
            { text: 'Apply', locator: { strategy: 'role', value: 'button:Apply' } },
            { text: 'Open menu', locator: { strategy: 'role', value: 'button:Open menu' } },
          ],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    expect(interactions.map((testCase) => testCase.title)).toEqual([
      'admin /todos button Open menu -> handled',
    ]);
  });

  it('deduplicates validation matrices for repeated numeric resource routes', () => {
    const fields: CrawlOutput['pages'][number]['forms'][number]['fields'] = [
      {
        name: 'title',
        type: 'text',
        label: 'Title',
        required: true,
        constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
        options: null,
        nameHints: [],
        locator: { strategy: 'label', value: 'Title' },
      },
    ];
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/todos/2/edit',
          title: 'Edit Todo',
          forms: [
            {
              action: '/todos/2',
              method: 'POST',
              crudOp: 'update',
              noValidate: true,
              fields,
              submit: { text: 'Update', locator: { strategy: 'role', value: 'button:Update' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
        {
          url: '/todos/3/edit',
          title: 'Edit Todo',
          forms: [
            {
              action: '/todos/3',
              method: 'POST',
              crudOp: 'update',
              noValidate: true,
              fields,
              submit: { text: 'Update', locator: { strategy: 'role', value: 'button:Update' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const updateForms = cases.filter((testCase) => testCase.kind === 'form' && testCase.form.crudOp === 'update');

    expect(updateForms.map((testCase) => testCase.title)).toEqual([
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - valid -> success',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title required-empty -> error',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title maxlength-plus-one -> error',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title maxlength-exact -> success',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title very-long -> graceful',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title unicode -> graceful',
      'admin /todos/2/edit form [action /todos/2; method POST; submit Update; fields title] - title whitespace -> graceful',
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

  it('maps common pagination controls as dedicated cases', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/products?page=1',
          title: 'Products',
          forms: [],
          links: [
            { href: '/products?page=2', text: '2', locator: { strategy: 'role', value: 'link:2' } },
            { href: '/products?page=3', text: '3', locator: { strategy: 'role', value: 'link:3' } },
          ],
          buttons: [
            { text: 'First', locator: { strategy: 'role', value: 'button:First' } },
            { text: 'Previous', locator: { strategy: 'role', value: 'button:Previous' } },
            { text: 'Next', locator: { strategy: 'role', value: 'button:Next' } },
            { text: 'Last', locator: { strategy: 'role', value: 'button:Last' } },
          ],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const pagination = cases.filter((testCase) => testCase.kind === 'pagination');
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    expect(pagination.map((testCase) => testCase.title)).toEqual([
      'admin /products pagination page 2 -> handled',
      'admin /products pagination page 3 -> handled',
      'admin /products pagination first -> handled',
      'admin /products pagination previous -> handled',
      'admin /products pagination next -> handled',
      'admin /products pagination last -> handled',
    ]);
    expect(new Set(pagination.map((testCase) => testCase.title)).size).toBe(pagination.length);
    expect(interactions).toHaveLength(0);
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
      'admin /inventory.html link /inventory.html -> handled',
      'admin /inventory.html button Add to cart -> handled',
    ]);
    expect(interactions).toHaveLength(2);
    expect(new Set(titles).size).toBe(titles.length);
    expect(JSON.stringify(cases)).not.toContain('sort=za');
  });
});
