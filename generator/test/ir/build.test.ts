import { describe, expect, it } from 'vitest';
import type { TestCase } from '../../src/generate/test-case.js';
import { planFor } from '../../src/ir/build.js';
import type { Step } from '../../src/ir/types.js';
import { emptyPage, makeConfig, noConstraints } from '../helpers/fixtures.js';

const config = makeConfig();
const readOnly = { ...config, mode: 'read-only' as const };
const kinds = (steps: Step[]) => steps.map((step) => step.kind);

const title = { name: 'title', type: 'text', label: 'Title', required: true, constraints: { ...noConstraints, maxlength: 255 }, options: null, nameHints: [], locator: { strategy: 'label' as const, value: 'Title' } };
const createForm = { action: '/todos', method: 'POST' as const, crudOp: 'create' as const, noValidate: true, declaresTarget: true, fields: [title], submit: { text: 'Create', locator: { strategy: 'role' as const, value: 'button:Create' } } };
const formCase = (overrides: Partial<Extract<TestCase, { kind: 'form' }>>): TestCase => ({
  kind: 'form', tier: 'positive', title: 'admin · /todos/create · creates', role: 'admin', page: emptyPage('/todos/create', 'Create'),
  form: createForm, targetField: null, variant: { kind: 'positive', name: 'valid', value: '', outcome: 'success' },
  values: { title: { kind: 'runtime', expr: 'faker.lorem.words(3)' } }, ...overrides,
});

describe('planFor (scenario rules, no framework)', () => {
  it('places every case in its file and describe groups with the manifest tags', () => {
    const plan = planFor(formCase({}), config);
    expect(plan).toMatchObject({ kind: 'form', file: 'forms/todos-create', describe: 'admin · /todos/create', formGroup: '"Create" form → POST /todos', tags: ['@positive', '@crud', '@role:admin', '@write'] });
  });

  it('declares runtime values, fills, submits, and proves persistence on a valid create', () => {
    const { steps } = planFor(formCase({}), config);
    expect(kinds(steps)).toEqual(['login', 'open', 'declare', 'fill', 'submit', 'assert']);
    expect(steps[2]).toEqual({ kind: 'declare', name: 'f_title', expr: 'faker.lorem.words(3)' });
    expect(steps[3]).toMatchObject({ fills: [{ kind: 'type', value: { kind: 'var', name: 'f_title' } }] });
    expect(steps.at(-1)).toEqual({ kind: 'assert', title: 'Expect the submission to succeed', oracles: [{ type: 'text-visible', value: { kind: 'var', name: 'f_title' } }] });
  });

  it('forces over-long values past maxlength and judges a server-validated error', () => {
    const { steps } = planFor(formCase({
      tier: 'negative', targetField: title, variant: { kind: 'negative', name: 'maxlength-plus-one', value: 'x'.repeat(256), outcome: 'error' },
      values: { title: { kind: 'literal', value: 'x'.repeat(256) } },
    }), config);
    expect(steps.find((step) => step.kind === 'fill')).toMatchObject({ fills: [{ kind: 'force-value', value: 'x'.repeat(256) }] });
    expect(steps.at(-1)).toMatchObject({ title: 'Expect a validation error', oracles: [{ type: 'server-error', urlPattern: '/todos/create(?:[?#].*)?$' }] });
  });

  it('accepts the confirm dialog and checks the row is gone on delete', () => {
    const deleteForm = { ...createForm, action: '/todos/3', crudOp: 'delete' as const, fields: [], submit: { text: 'Delete', locator: { strategy: 'role' as const, value: 'button:Delete' } } };
    const { steps } = planFor(formCase({ form: deleteForm, variant: { kind: 'positive', name: 'delete', value: '', outcome: 'success' }, values: {} }), config);
    expect(steps.find((step) => step.kind === 'submit')).toMatchObject({ acceptDialog: true, submit: { formSelector: 'form[action$="/todos/3"]' } });
    expect(steps.at(-1)).toMatchObject({ title: 'Expect the record to be gone', oracles: [{ type: 'record-gone', formSelector: 'form[action$="/todos/3"]' }, { type: 'body-graceful' }] });
  });

  it('captures the toggle text before a state-change submit', () => {
    const toggle = { ...createForm, action: '/todos/1/toggle', crudOp: 'update' as const, fields: [], submit: { text: 'Mark done', locator: { strategy: 'role' as const, value: 'button:Mark done' } } };
    const { steps } = planFor(formCase({ form: toggle, values: {} }), config);
    expect(kinds(steps)).toEqual(['login', 'open', 'capture-text', 'submit', 'assert']);
    expect(steps.at(-1)).toMatchObject({ oracles: [{ type: 'state-flipped' }] });
  });

  it('echoes a valid GET form into the URL only when the form declares a method or action', () => {
    const search = { ...createForm, action: '/todos', method: 'GET' as const, crudOp: 'unknown' as const, noValidate: false };
    const echoed = planFor(formCase({ form: search }), config).steps.at(-1);
    expect(echoed).toMatchObject({ oracles: [{ type: 'query-echo' }] });
    const scriptForm = planFor(formCase({ form: { ...search, declaresTarget: false } }), config).steps.at(-1);
    expect(scriptForm).toMatchObject({ oracles: [{ type: 'body-graceful' }] });
  });

  it('reuses the session and checks each page is up in read-only mode', () => {
    const pagination: TestCase = {
      kind: 'pagination', tier: 'positive', title: 'admin · /todos · next', role: 'admin', page: emptyPage('/todos', 'Todos'),
      pagination: { type: 'link', label: 'Next', locator: { strategy: 'role', value: 'link:Next' }, ordinal: 0, href: '/todos?page=2', action: 'next' },
    };
    const { steps } = planFor(pagination, readOnly);
    expect(steps[0]).toEqual({ kind: 'login', title: 'Use the admin session', role: 'admin', mode: 'reuse' });
    expect(steps[1]).toEqual({ kind: 'open', title: 'Open /todos', url: '/todos', capture: 'opened' });
    expect(steps[2]).toEqual({ kind: 'assert', title: 'Expect /todos to be up', oracles: [{ type: 'route-allowed', path: '/todos', capture: 'opened' }] });
    expect(steps[3]).toMatchObject({ kind: 'act', skipReason: 'pagination target is not visible', action: { type: 'click' } });
    expect(steps[4]).toMatchObject({ oracles: [{ type: 'landed', path: '/todos?page=2', withSearch: true }] });
  });

  it('opens RBAC routes with a captured status and picks the matching oracle', () => {
    const blocked = planFor({ kind: 'rbac', tier: 'negative', title: 'user cannot open /admin/users', role: 'user', route: '/admin/users?page=2', expectAllowed: false }, config);
    expect(blocked.steps.slice(1)).toEqual([
      { kind: 'open', title: 'Open /admin/users?page=2', url: '/admin/users?page=2', capture: 'response' },
      { kind: 'assert', title: 'Expect the route to be blocked', oracles: [{ type: 'route-blocked', path: '/admin/users', capture: 'response' }] },
    ]);
    const inferred = planFor({ kind: 'rbac', tier: 'positive', title: 'admin opens /todos/7', role: 'admin', route: '/todos/7', expectAllowed: true, inferred: true }, config);
    expect(inferred.steps.at(-1)).toMatchObject({ oracles: [{ type: 'route-inferred' }] });
  });

  it('logs in with explicit credentials for auth scenarios', () => {
    const plan = planFor({ kind: 'auth', tier: 'negative', title: 'wrong password', role: 'admin', username: 'admin@example.com', password: 'password-wrong', expectSuccess: false }, config);
    expect(plan.steps).toEqual([
      { kind: 'login-with', title: 'Log in as admin@example.com', username: 'admin@example.com', password: 'password-wrong' },
      { kind: 'assert', title: 'Expect the login to be rejected', oracles: [{ type: 'login-rejected' }] },
    ]);
  });
});

describe('fill planning for radios and repeated names', () => {
  const radio = { ...title, name: 'size', type: 'radio', options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }], locator: { strategy: 'name' as const, value: 'size' } };
  const dotted = { ...title, name: 'user.name', locator: { strategy: 'label' as const, value: 'Name' } };
  const scored = { ...title, name: 'user_name', locator: { strategy: 'label' as const, value: 'Login' } };
  const repeated = { ...title, name: 'tag' };
  const form = { ...createForm, fields: [dotted, scored, repeated, repeated, radio] };
  const values = {
    'user.name': { kind: 'runtime' as const, expr: 'faker.lorem.word()' },
    user_name: { kind: 'runtime' as const, expr: 'faker.internet.username()' },
    tag: { kind: 'runtime' as const, expr: 'faker.lorem.word()' },
    size: { kind: 'literal' as const, value: 's' },
  };

  it('declares every variable once, under a distinct name', () => {
    const { steps } = planFor(formCase({ form, values }), config);
    expect(steps.filter((step) => step.kind === 'declare').map((step) => step.name)).toEqual(['f_user_name', 'f_user_name_2', 'f_tag']);
  });

  it('checks the radio that carries the value, and forces an unknown one', () => {
    const fills = (testCase: TestCase) => planFor(testCase, config).steps.flatMap((step) => (step.kind === 'fill' ? step.fills : []));
    expect(fills(formCase({ form, values })).at(-1)).toEqual({ kind: 'check', target: { strategy: 'css', value: 'input[type="radio"][name="size"][value="s"]' } });
    const invalid = formCase({
      form, targetField: radio, variant: { kind: 'negative', name: 'invalid-option', value: '__x__', outcome: 'error', forceInvalidOption: true },
      values: { ...values, size: { kind: 'literal', value: '__x__' } },
    });
    expect(fills(invalid).at(-1)).toEqual({ kind: 'force-radio', name: 'size', value: '__x__' });
  });
});

