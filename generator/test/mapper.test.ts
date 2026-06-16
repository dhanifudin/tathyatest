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
    usernameField: 'email',
    passwordField: 'password',
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
  it('keeps confirmation fields aligned in the base CRUD payload', () => {
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
    const valid = cases.find((testCase) => testCase.kind === 'crud' && testCase.variant.name === 'valid');
    const mismatch = cases.find((testCase) => testCase.kind === 'crud' && testCase.variant.name === 'confirmation-mismatch');

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
    const blank = cases.find((testCase) => testCase.kind === 'crud' && testCase.variant.name === 'required-empty');

    expect(blank?.targetField?.name).toBe('status');
    expect(blank?.values.status).toBe('');
  });
});
