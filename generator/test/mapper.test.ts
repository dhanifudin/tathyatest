import { describe, expect, it } from 'vitest';
import { mapTestCases, navScenarioKeysForPage } from '../src/mapper.js';
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
    faker: { locale: 'en', seed: 1234 },
  },
  evaluation: { outDir: 'metrics', repeat: 1, manualBaselineSecPerCase: 300, baselineDir: 'tests/manual', faultProject: null, stacks: [], faults: { enabled: true, classes: ['validation', 'authz', 'crud', 'pagination', 'auth'] } },
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

    // contact_email is unique → generated at runtime; its confirmation references the same const.
    expect(valid?.values.contact_email).toMatchObject({ kind: 'runtime' });
    expect(valid?.values.contact_email && 'expr' in valid.values.contact_email ? valid.values.contact_email.expr : '').toContain('faker');
    expect(valid?.values.contact_email_confirmation).toEqual({ kind: 'ref', name: 'contact_email' });
    expect(valid?.values.status).toEqual({ kind: 'literal', value: 'open' });
    expect(mismatch?.values.contact_email).toMatchObject({ kind: 'runtime' });
    expect(mismatch?.values.contact_email_confirmation).toEqual({ kind: 'literal', value: 'user@example.com-mismatch' });
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
    expect(blank?.values.status).toEqual({ kind: 'literal', value: '' });
  });

  it('skips browser-unfalsifiable variants on native forms but keeps them on novalidate forms', () => {
    const field = (label: string) => ({
      name: 'title',
      type: 'text',
      label,
      required: true,
      constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
      options: null,
      nameHints: [],
      locator: { strategy: 'label' as const, value: label },
    });
    const selectField = {
      name: 'status',
      type: 'select',
      label: 'Status',
      required: true,
      constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
      options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }],
      nameHints: [],
      locator: { strategy: 'label' as const, value: 'Status' },
    };
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
              fields: [field('Native title'), { ...selectField, label: 'Native status', locator: { strategy: 'label', value: 'Native status' } }],
              submit: { text: 'Apply', locator: { strategy: 'role', value: 'button:Apply' } },
            },
            {
              action: '/todos/nv',
              method: 'POST',
              crudOp: 'create',
              noValidate: true,
              fields: [field('NV title'), { ...selectField, label: 'NV status', locator: { strategy: 'label', value: 'NV status' } }],
              submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
            },
          ],
          links: [],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const variantNamesFor = (action: string) => cases
      .filter((testCase) => testCase.kind === 'form' && testCase.form.action === action)
      .map((testCase) => testCase.variant.name);

    // Native form: fill() never dirties the field, so these violations cannot flip validity.valid.
    expect(variantNamesFor('/todos')).not.toContain('maxlength-plus-one');
    expect(variantNamesFor('/todos')).not.toContain('invalid-option');
    // Novalidate form: the server sees the raw values and must render a visible error.
    expect(variantNamesFor('/todos/nv')).toContain('maxlength-plus-one');
    expect(variantNamesFor('/todos/nv')).toContain('invalid-option');
  });

  it('keeps one representative per route shape for pages and blocked routes', () => {
    const editPage = (id: number) => ({
      url: `/todos/${id}/edit`,
      title: `Edit ${id}`,
      forms: [],
      links: [{ href: '/todos', text: 'Back', locator: { strategy: 'role' as const, value: 'link:Back' } }],
      buttons: [],
      tables: [],
    });
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [editPage(1), editPage(2), editPage(3)],
    };
    const matrix: AccessMatrix = new Map([
      ['/todos/1/edit', { route: '/todos/1/edit', reachableBy: ['admin'] }],
      ['/todos/2/edit', { route: '/todos/2/edit', reachableBy: ['admin'] }],
      ['/admin/users', { route: '/admin/users', reachableBy: ['admin'] }],
    ]);
    const twoRoleConfig: TathyaConfig = {
      ...config,
      auth: {
        ...config.auth,
        roles: [
          { name: 'admin', username: 'admin@example.com', password: 'password' },
          { name: 'user', username: 'user@example.com', password: 'password' },
        ],
      },
    };

    const cases = mapTestCases([crawl], matrix, twoRoleConfig);
    const allowed = cases.filter((testCase) => testCase.kind === 'rbac' && testCase.expectAllowed);
    const blocked = cases.filter((testCase) => testCase.kind === 'rbac' && !testCase.expectAllowed);
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    // /todos/1..3/edit collapse to one representative page: one allowed case, one interaction set.
    expect(allowed.map((testCase) => testCase.route)).toEqual(['/todos/1/edit']);
    expect(interactions).toHaveLength(1);
    // Blocked: /todos/{1,2}/edit are ONE ownership scenario for "user"; /admin/users is another.
    expect(blocked.map((testCase) => `${testCase.role}:${testCase.route}`).sort()).toEqual([
      'user:/admin/users',
      'user:/todos/1/edit',
    ]);
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

    // One representative per action: page 3 collapses into the page-2 numbered-jump scenario.
    expect(pagination.map((testCase) => testCase.title)).toEqual([
      'admin /products pagination page 2 -> handled',
      'admin /products pagination first -> handled',
      'admin /products pagination previous -> handled',
      'admin /products pagination next -> handled',
      'admin /products pagination last -> handled',
    ]);
    expect(new Set(pagination.map((testCase) => testCase.title)).size).toBe(pagination.length);
    expect(interactions).toHaveLength(0);
  });

  it('keeps one interaction per link target shape across rows and source pages', () => {
    const link = (href: string, text: string) => ({ href, text, locator: { strategy: 'role' as const, value: `link:${text}` } });
    const page = (url: string, links: ReturnType<typeof link>[]) => ({ url, title: url, forms: [], links, buttons: [], tables: [] });
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        page('/todos', [link('/todos/1/edit', 'Edit'), link('/todos/2/edit', 'Edit'), link('/dashboard', 'Dashboard')]),
        page('/dashboard', [link('/dashboard', 'Dashboard'), link('/todos', 'Todos'), link('/todos?status=done', 'Done')]),
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const interactions = cases.filter((testCase) => testCase.kind === 'interaction');

    // Row edit links are one scenario (/todos/:id/edit); the navbar Dashboard link tested
    // once for the role, not once per source page; the ?status filter link stays distinct
    // from the bare /todos target because its query KEY differs.
    expect(interactions.map((testCase) => testCase.title)).toEqual([
      'admin /todos link /todos/1/edit -> handled',
      'admin /todos link /dashboard -> handled',
      'admin /dashboard link /todos -> handled',
      'admin /dashboard link /todos?status=done -> handled',
    ]);
  });

  it('keeps navScenarioKeysForPage in lockstep with emitted nav cases', () => {
    const page: CrawlOutput['pages'][number] = {
      url: '/todos',
      title: 'Todos',
      forms: [
        {
          action: '/todos',
          method: 'GET',
          crudOp: 'unknown',
          noValidate: false,
          fields: [],
          submit: { text: 'Apply', locator: { strategy: 'role', value: 'button:Apply' } },
        },
      ],
      links: [
        { href: '/todos/1/edit', text: 'Edit', locator: { strategy: 'role', value: 'link:Edit' } },
        { href: '/todos/2/edit', text: 'Edit', locator: { strategy: 'role', value: 'link:Edit' } },
        { href: '/dashboard', text: 'Dashboard', locator: { strategy: 'role', value: 'link:Dashboard' } },
        { href: '/todos?page=2', text: 'Next', locator: { strategy: 'role', value: 'link:Next' } },
        { href: '/todos?page=3', text: '3', locator: { strategy: 'role', value: 'link:3' } },
      ],
      buttons: [
        { text: 'Apply', locator: { strategy: 'role', value: 'button:Apply' } },
        { text: 'Open menu', locator: { strategy: 'role', value: 'button:Open menu' } },
      ],
      tables: [],
      controls: [
        {
          kind: 'select',
          text: null,
          options: [{ value: 'az', label: 'A-Z' }],
          locator: { strategy: 'testid', value: 'sort' },
        },
      ],
    };
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [page],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const navCases = cases.filter((testCase) => testCase.kind === 'interaction' || testCase.kind === 'pagination');
    const scenarioKeys = new Set(navScenarioKeysForPage(page, config.baseUrl));

    // The metrics denominator (scenario keys) must equal what the mapper emits, or the
    // element-coverage family drifts from the generator's dedup semantics.
    expect(scenarioKeys.size).toBe(navCases.length);
  });

  it('emits validation variants once across roles but keeps positives per role', () => {
    const twoRoleConfig: TathyaConfig = {
      ...config,
      auth: {
        ...config.auth,
        roles: [
          { name: 'admin', username: 'admin@example.com', password: 'password' },
          { name: 'user', username: 'user@example.com', password: 'password' },
        ],
      },
    };
    const crawlFor = (role: string): CrawlOutput => ({
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role,
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
                  name: 'title',
                  type: 'text',
                  label: 'Title',
                  required: true,
                  constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
                  options: null,
                  nameHints: [],
                  locator: { strategy: 'label', value: 'Title' },
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
    });

    const cases = mapTestCases([crawlFor('admin'), crawlFor('user')], new Map(), twoRoleConfig);
    const forms = cases.filter((testCase) => testCase.kind === 'form');
    const positives = forms.filter((testCase) => testCase.variant.name === 'valid');
    const requiredEmpty = forms.filter((testCase) => testCase.variant.name === 'required-empty');

    // The happy path proves each role can perform the CRUD op; the validation variant is
    // role-independent server logic — one scenario, owned by the first role to reach it.
    expect(positives.map((testCase) => testCase.role)).toEqual(['admin', 'user']);
    expect(requiredEmpty.map((testCase) => testCase.role)).toEqual(['admin']);
  });

  it('does not treat the current-page paginator link as a pagination scenario', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/todos',
          title: 'Todos',
          forms: [],
          // React paginators link the current page too ("1" -> /todos?page=1 while on /todos);
          // the numbered-jump representative must be a link that actually navigates.
          links: [
            { href: '/todos?page=1', text: '1', locator: { strategy: 'role', value: 'link:1' } },
            { href: '/todos?page=2', text: '2', locator: { strategy: 'role', value: 'link:2' } },
          ],
          buttons: [],
          tables: [],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const pagination = cases.filter((testCase) => testCase.kind === 'pagination');

    expect(pagination.map((testCase) => testCase.title)).toEqual([
      'admin /todos pagination page 2 -> handled',
    ]);
  });

  it('emits select interaction cases from orphan controls and picks a representative option', () => {
    const crawl: CrawlOutput = {
      baseUrl: config.baseUrl,
      engine: 'rendered',
      role: 'admin',
      crawledAt: '2026-06-15T00:00:00.000Z',
      pages: [
        {
          url: '/inventory.html',
          title: 'Inventory',
          forms: [],
          links: [],
          buttons: [],
          tables: [],
          controls: [
            {
              kind: 'select',
              text: null,
              options: [
                { value: 'az', label: 'Name (A to Z)' },
                { value: 'za', label: 'Name (Z to A)' },
                { value: 'lohi', label: 'Price (low to high)' },
                { value: 'hilo', label: 'Price (high to low)' },
              ],
              locator: { strategy: 'testid', value: 'product-sort-container' },
            },
          ],
        },
      ],
    };

    const cases = mapTestCases([crawl], new Map(), config);
    const selects = cases.filter((testCase) => testCase.kind === 'interaction' && testCase.interaction.type === 'select');

    expect(selects).toHaveLength(1);
    expect(selects[0].title).toBe('admin /inventory.html select testid:product-sort-container -> handled');
    // Representative option: last non-empty value (hilo)
    expect(selects[0].interaction.optionValue).toBe('hilo');
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
      'admin /inventory.html link /inventory.html?item=1 -> handled',
      'admin /inventory.html button Add to cart -> handled',
    ]);
    expect(interactions).toHaveLength(2);
    expect(new Set(titles).size).toBe(titles.length);
    expect(JSON.stringify(cases)).not.toContain('sort=za');
  });
});
