import type { TathyaConfig } from '../config.js';
import type { Field, Form } from '../crawl/model.js';
import type { TestCase } from '../generate/test-case.js';
import { escapeRegExp } from '../util/escape.js';
import { canonicalPath } from '../util/paths.js';
import { describeTitle, formDescribeTitle, linkLandingPath, specStemFor, tagsAndAnnotations } from './layout.js';
import type { Fill, Oracle, Step, SubmitTarget, TestPlan, ValueRef } from './types.js';

type FormCase = Extract<TestCase, { kind: 'form' }>;
type SessionCase = Extract<TestCase, { kind: 'form' | 'interaction' | 'pagination' | 'rbac' }>;

/**
 * The scenario rules: turn one `TestCase` into its framework-neutral `TestPlan`. Every decision an
 * emitter used to take (which steps, how a field is filled, which oracle judges the outcome, when a
 * test skips itself) is taken here, once, for every adapter. Pure and deterministic.
 */
export function planFor(testCase: TestCase, config: TathyaConfig): TestPlan {
  const { tags, annotations } = tagsAndAnnotations(testCase);
  return {
    kind: testCase.kind,
    file: specStemFor(testCase),
    role: testCase.role,
    describe: describeTitle(testCase),
    formGroup: testCase.kind === 'form' ? formDescribeTitle(testCase) : undefined,
    title: testCase.title,
    tags,
    annotations,
    steps: stepsFor(testCase, config),
  };
}

function stepsFor(testCase: TestCase, config: TathyaConfig): Step[] {
  switch (testCase.kind) {
    case 'auth':
      return authSteps(testCase);
    case 'form':
      return formSteps(testCase, config);
    case 'interaction':
      return interactionSteps(testCase, config);
    case 'pagination':
      return paginationSteps(testCase, config);
    case 'rbac':
      return rbacSteps(testCase, config);
  }
}

/** Reset + log in; read-only runs reuse the stored session instead (and never reset). */
function loginStep(testCase: SessionCase, config: TathyaConfig): Step {
  return config.mode === 'read-only'
    ? { kind: 'login', title: `Use the ${testCase.role} session`, role: testCase.role, mode: 'reuse' }
    : { kind: 'login', title: `Log in as ${testCase.role}`, role: testCase.role, mode: 'reset' };
}

/**
 * Open a page. In read-only mode the visit itself is a check (UptimeRobot-style): the response
 * must be healthy, or the route must still render as a page for an SPA deep link.
 */
function openSteps(url: string, config: TathyaConfig): Step[] {
  if (config.mode !== 'read-only') return [{ kind: 'open', title: `Open ${url}`, url }];
  return [
    { kind: 'open', title: `Open ${url}`, url, capture: 'opened' },
    { kind: 'assert', title: `Expect ${url} to be up`, oracles: [{ type: 'route-allowed', path: canonicalPath(url), capture: 'opened' }] },
  ];
}

// Attribute suffix match: the crawler normalizes form.action to pathname+search while the DOM
// attribute may be an absolute URL or a relative path.
export function formActionSelector(action: string): string {
  return `form[action$="${action.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

function submitTargetOf(form: Form): SubmitTarget {
  return { formSelector: formActionSelector(form.action), locator: form.submit.locator };
}

// ---------------------------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------------------------

function authSteps(testCase: Extract<TestCase, { kind: 'auth' }>): Step[] {
  if (testCase.logout) {
    const { page: logoutPage, form } = testCase.logout;
    return [
      { kind: 'login', title: `Log in as ${testCase.role}`, role: testCase.role, mode: 'reset' },
      { kind: 'open', title: `Open ${logoutPage.url}`, url: logoutPage.url },
      // Logout controls usually live in a collapsed account menu; the scenario is that the session
      // ends, not the menu animation, so the form is submitted directly when its control is hidden.
      { kind: 'logout', title: 'Log out', submit: submitTargetOf(form) },
      { kind: 'assert', title: `Expect ${logoutPage.url} to need a login again`, oracles: [{ type: 'logged-out', path: logoutPage.url }] },
    ];
  }
  return [
    { kind: 'login-with', title: `Log in as ${testCase.username}`, username: testCase.username, password: testCase.password },
    testCase.expectSuccess
      ? { kind: 'assert', title: 'Expect to be logged in', oracles: [{ type: 'logged-in' }] }
      : { kind: 'assert', title: 'Expect the login to be rejected', oracles: [{ type: 'login-rejected' }] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

function formSteps(testCase: FormCase, config: TathyaConfig): Step[] {
  const { decls, fills } = fillPlan(testCase);
  const steps: Step[] = [loginStep(testCase, config), ...openSteps(testCase.page.url, config), ...decls];
  if (fills.length > 0) steps.push({ kind: 'fill', title: 'Fill the form', fills });
  // A state-change form (toggle) is judged by its own control reading differently afterwards.
  if (isStateChangeForm(testCase)) steps.push({ kind: 'capture-text', name: 'before', submit: submitTargetOf(testCase.form) });
  // Accept a potential confirm() dialog on delete; a dismissed dialog would silently cancel it.
  steps.push({ kind: 'submit', title: 'Submit', submit: submitTargetOf(testCase.form), acceptDialog: testCase.variant.name === 'delete' });
  steps.push({ kind: 'assert', title: outcomeStepTitle(testCase), oracles: formOracles(testCase, config) });
  return steps;
}

/** Fieldless update forms with a labelled submit: "Mark done" → "Mark undone". */
function isStateChangeForm(testCase: FormCase): boolean {
  return testCase.form.fields.length === 0 && testCase.form.crudOp === 'update' && testCase.variant.name === 'valid' && Boolean(testCase.form.submit.text);
}

function outcomeStepTitle(testCase: FormCase): string {
  if (testCase.variant.name === 'delete') return 'Expect the record to be gone';
  if (testCase.variant.outcome === 'error') return 'Expect a validation error';
  if (testCase.variant.outcome === 'graceful') return 'Expect no server error';
  if (isStateChangeForm(testCase)) return 'Expect the state to have changed';
  if (testCase.form.method === 'GET' && testCase.variant.name === 'valid') return 'Expect the filters in the URL';
  return 'Expect the submission to succeed';
}

export function fieldVar(name: string): string {
  return `f_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function fillPlan(testCase: FormCase): { decls: Step[]; fills: Fill[] } {
  const { form, values } = testCase;

  // Resolve runtime/ref fields to a variable (or a referenced literal) and collect their decls.
  const decls: Step[] = [];
  const runtimeFill = new Map<string, ValueRef>();
  for (const field of form.fields) {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) continue;
    if (fieldValue.kind === 'runtime') {
      const variable = fieldVar(field.name);
      decls.push({ kind: 'declare', name: variable, expr: fieldValue.expr });
      runtimeFill.set(field.name, { kind: 'var', name: variable });
    } else if (fieldValue.kind === 'ref') {
      const source = values[fieldValue.name];
      if (source?.kind === 'runtime') runtimeFill.set(field.name, { kind: 'var', name: fieldVar(fieldValue.name) });
      else if (source?.kind === 'literal') runtimeFill.set(field.name, { kind: 'literal', value: source.value });
    }
  }

  const fills = form.fields.flatMap((field): Fill[] => {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) return [];
    const target = field.locator;
    const runtimeValue = runtimeFill.get(field.name);
    if (runtimeValue !== undefined && fieldValue.kind !== 'literal') return [{ kind: 'type', target, value: runtimeValue }];
    const value = fieldValue.kind === 'literal' ? fieldValue.value : '';
    const isBlankTarget = testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty';
    // File pickers cannot be typed into: the literal is a MIME type → upload a fixture of it, or
    // clear the selection for the required-empty negative.
    if (field.type === 'file') return [value === '' ? { kind: 'clear-file', target } : { kind: 'upload', target, mimeType: value }];
    if (field.type === 'radio') return [isBlankTarget ? { kind: 'uncheck-radios', name: field.name } : { kind: 'check', target }];
    if (shouldForceInvalidOption(testCase, field)) return [{ kind: 'force-option', target, value }];
    if (field.options?.length && isBlankTarget) return [{ kind: 'clear-select', target }];
    if (shouldForceValue(testCase, field)) return [{ kind: 'force-value', target, value }];
    if (field.type === 'checkbox') return [{ kind: 'set-checked', target, checked: value === 'on' || value === 'true' }];
    if (field.options?.length) return [{ kind: 'select-option', target, value }];
    return [{ kind: 'type', target, value: { kind: 'literal', value } }];
  });

  return { decls, fills };
}

/** Values past `maxlength` (or very long ones) bypass the browser's input limit. */
function shouldForceValue(testCase: FormCase, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'maxlength-plus-one' ||
    testCase.variant.name === 'very-long'
  );
}

function shouldForceInvalidOption(testCase: FormCase, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'invalid-option' ||
    testCase.variant.forceInvalidOption === true
  );
}

function formOracles(testCase: FormCase, config: TathyaConfig): Oracle[] {
  const formSelector = formActionSelector(testCase.form.action);
  if (testCase.form.crudOp === 'delete' && testCase.variant.name === 'delete') {
    // The deleted entity's form action is unique per row, so its disappearance proves the delete
    // took effect. Row counting is deliberately avoided: on paginated listings the page size stays
    // constant after a delete, and hard-coding the redirect URL would leak app-specific paths.
    return [{ type: 'record-gone', formSelector }, { type: 'body-graceful' }];
  }
  if (testCase.variant.outcome === 'error' && testCase.targetField) {
    return [errorOracle(testCase.form, testCase.targetField, config.oracle.errorSelector, testCase.page.url, testCase.variant.name)];
  }
  if (testCase.variant.outcome === 'graceful') return [{ type: 'body-graceful' }];
  if (isStateChangeForm(testCase)) return [{ type: 'state-flipped', formSelector }];
  // A form without an `action` is handled by JS (SPA): nothing guarantees the values reach the URL.
  if (testCase.form.method === 'GET' && testCase.form.actionDeclared !== false && testCase.variant.name === 'valid') {
    const params = submittedParams(testCase);
    if (params.length > 0) return [{ type: 'query-echo', params }];
  }
  const representative = representativeTextValue(testCase);
  // Only the canonical happy path asserts the echoed value: other success-outcome variants
  // (maxlength-exact, optional-omitted) submit values a list view may legitimately truncate.
  if (representative && testCase.variant.name === 'valid' && (testCase.form.crudOp === 'create' || testCase.form.crudOp === 'update')) {
    return [{ type: 'text-visible', value: representative }];
  }
  return [{ type: 'body-graceful' }];
}

/**
 * The error oracle branches on how the form validates: `novalidate` (or a constraint the field
 * does not carry natively) → the server re-renders with an error indicator on the form URL;
 * otherwise HTML5 constraint validation blocks the submit and the field reports `validity.valid`
 * false. Never a message text.
 */
export function errorOracle(form: Form, field: Field, errorSelector: string, expectedPath?: string, variantName?: string): Oracle {
  if (form.noValidate || !nativelyObservable(field, variantName)) {
    return { type: 'server-error', errorSelector, urlPattern: `${escapeRegExp(expectedPath ?? form.action)}(?:[?#].*)?$` };
  }
  return { type: 'native-invalid', target: field.locator };
}

/**
 * Whether the violated constraint exists natively on the field, so constraint validation
 * (validity.valid) can observe it. A `required-empty` variant forced via `data.requiredFields`
 * on a field without the `required` attribute is only observable through the app's own error
 * display (JS validation or a server round-trip) — e.g. SauceDemo's checkout fields.
 */
function nativelyObservable(field: Field, variantName?: string): boolean {
  if (variantName === 'required-empty') return field.required;
  return true;
}

/** The values a GET form submits, in field order. */
function submittedParams(testCase: FormCase): { name: string; value: ValueRef }[] {
  const entries: { name: string; value: ValueRef }[] = [];
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue === undefined || ['file', 'checkbox', 'radio'].includes(field.type)) continue;
    if (fieldValue.kind === 'runtime') entries.push({ name: field.name, value: { kind: 'var', name: fieldVar(field.name) } });
    else if (fieldValue.kind === 'literal') entries.push({ name: field.name, value: { kind: 'literal', value: fieldValue.value } });
    else {
      const source = testCase.values[fieldValue.name];
      if (source?.kind === 'runtime') entries.push({ name: field.name, value: { kind: 'var', name: fieldVar(fieldValue.name) } });
      else if (source?.kind === 'literal') entries.push({ name: field.name, value: { kind: 'literal', value: source.value } });
    }
  }
  return entries;
}

// The submitted value the app should echo back after a successful create/update — asserting it
// is what makes the positive oracle prove persistence (a redirect alone also happens when the
// server silently drops the write). Prefer a faker-generated text field (unique by
// construction); fall back to a config-pinned literal text value. Textarea fields are excluded
// because their content is rarely rendered in list/summary views.
function representativeTextValue(testCase: FormCase): ValueRef | null {
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'runtime' && ['text', 'search'].includes(field.type)) return { kind: 'var', name: fieldVar(field.name) };
  }
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'literal' && fieldValue.value.trim().length >= 3 && ['text', 'search'].includes(field.type)) {
      return { kind: 'literal', value: fieldValue.value };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Interactions, pagination, RBAC
// ---------------------------------------------------------------------------------------------

function interactionSteps(testCase: Extract<TestCase, { kind: 'interaction' }>, config: TathyaConfig): Step[] {
  const { interaction } = testCase;
  const act: Step = interaction.type === 'select' && interaction.optionValue !== undefined
    ? { kind: 'act', title: `Select "${interaction.optionValue}" in ${interaction.label}`, target: { locator: interaction.locator, ordinal: interaction.ordinal }, action: { type: 'select', value: interaction.optionValue }, skipReason: 'interaction target is not visible' }
    : { kind: 'act', title: `Click ${interaction.type} "${interaction.label}"`, target: { locator: interaction.locator, ordinal: interaction.ordinal }, action: { type: 'click' }, skipReason: 'interaction target is not visible' };
  // A link with a navigable same-origin target must land there (SPA routers included); the
  // no-server-error check alone would also pass a dead link.
  const landing = linkLandingPath(testCase, config);
  return [
    loginStep(testCase, config),
    ...openSteps(testCase.page.url, config),
    act,
    ...(landing ? [{ kind: 'assert', title: `Expect to land on ${landing}`, oracles: [{ type: 'landed', path: landing, withSearch: false }] } satisfies Step] : []),
    { kind: 'assert', title: 'Expect no server error', oracles: [{ type: 'no-server-error' }] },
  ];
}

function paginationSteps(testCase: Extract<TestCase, { kind: 'pagination' }>, config: TathyaConfig): Step[] {
  const { pagination } = testCase;
  const title = pagination.action === 'page' ? `Go to page ${pagination.label}` : `Go to the ${pagination.action} page`;
  const landing = pagination.href ? pathAndSearch(pagination.href, config.baseUrl) : null;
  return [
    loginStep(testCase, config),
    ...openSteps(testCase.page.url, config),
    { kind: 'act', title, target: { locator: pagination.locator, ordinal: pagination.ordinal }, action: { type: 'click' }, skipReason: 'pagination target is not visible' },
    ...(landing ? [{ kind: 'assert', title: `Expect to land on ${landing}`, oracles: [{ type: 'landed', path: landing, withSearch: true }] } satisfies Step] : []),
    { kind: 'assert', title: 'Expect no server error', oracles: [{ type: 'no-server-error' }] },
  ];
}

function pathAndSearch(href: string, baseUrl: string): string {
  const url = new URL(href, baseUrl);
  return `${url.pathname}${url.search}`;
}

function rbacSteps(testCase: Extract<TestCase, { kind: 'rbac' }>, config: TathyaConfig): Step[] {
  if (testCase.affordance) {
    const { affordance } = testCase;
    return [
      loginStep(testCase, config),
      ...openSteps(affordance.page.url, config),
      { kind: 'assert', title: `Expect no "${affordance.label}" link`, oracles: [{ type: 'absent', target: affordance.locator }] },
    ];
  }
  const path = canonicalPath(testCase.route);
  const outcome: Step = testCase.inferred
    ? { kind: 'assert', title: 'Expect the inferred route to open (skips on a clean 404)', oracles: [{ type: 'route-inferred', path, capture: 'response' }] }
    : testCase.expectAllowed
      ? { kind: 'assert', title: 'Expect the route to be allowed', oracles: [{ type: 'route-allowed', path, capture: 'response' }] }
      : { kind: 'assert', title: 'Expect the route to be blocked', oracles: [{ type: 'route-blocked', path, capture: 'response' }] };
  return [
    loginStep(testCase, config),
    { kind: 'open', title: `Open ${testCase.route}`, url: testCase.route, capture: 'response' },
    outcome,
  ];
}
