import type { TathyaConfig } from '../config.js';
import type { Field, Form, Locator } from '../crawl/model.js';
import type { TestCase } from '../generate/test-case.js';
import { escapeAttrValue, escapeRegExp } from '../util/escape.js';
import { routeShape } from '../generate/rbac.js';
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
      return authSteps(testCase, config);
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

/** A form without an `action` attribute can only be told apart by the control it holds. */
function formSelectorOf(form: Form): string {
  return form.hasActionAttribute === false ? 'form:not([action])' : formActionSelector(form.action);
}

function submitTargetOf(form: Form, baseUrl: string): SubmitTarget {
  const path = new URL(form.action, baseUrl).pathname;
  const actionShape = form.hasActionAttribute !== false && routeShape(path) !== path ? shapePattern(path) : null;
  return { formSelector: formSelectorOf(form), actionShape, locator: form.submit.locator };
}

/** A pattern matching every pathname of `path`'s route shape (record ids are interchangeable). */
function shapePattern(path: string): string {
  return `^${routeShape(path).split('/').map((part) => (part === ':id' ? '\\d+' : escapeRegExp(part))).join('/')}$`;
}

// ---------------------------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------------------------

function authSteps(testCase: Extract<TestCase, { kind: 'auth' }>, config: TathyaConfig): Step[] {
  if (testCase.logout) {
    const { page: logoutPage, form } = testCase.logout;
    // A page that needs the session: where the login landed, else the page that offered the logout.
    const protectedPath = testCase.logout.protectedPath ?? logoutPage.url;
    return [
      { kind: 'login', title: `Log in as ${testCase.role}`, role: testCase.role, mode: 'reset' },
      { kind: 'open', title: `Open ${logoutPage.url}`, url: logoutPage.url },
      // Logout controls usually live in a collapsed account menu; the scenario is that the session
      // ends, not the menu animation, so the form is submitted directly when its control is hidden.
      { kind: 'logout', title: 'Log out', submit: submitTargetOf(form, config.baseUrl) },
      { kind: 'assert', title: `Expect ${protectedPath} to need a login again`, oracles: [{ type: 'logged-out', path: protectedPath }] },
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
  const submit = submitTargetOf(testCase.form, config.baseUrl);
  const steps: Step[] = [loginStep(testCase, config), ...openSteps(testCase.page.url, config), { kind: 'scope-form', submit }, ...decls];
  if (fills.length > 0) steps.push({ kind: 'fill', title: 'Fill the form', fills });
  // A state-change form (toggle) is judged by its own control reading differently afterwards.
  if (isStateChangeForm(testCase)) steps.push({ kind: 'capture-text', name: 'before', submit });
  // Accept a potential confirm() dialog on delete; a dismissed dialog would silently cancel it.
  steps.push({ kind: 'submit', title: 'Submit', submit, acceptDialog: testCase.variant.name === 'delete' });
  steps.push({ kind: 'assert', title: outcomeStepTitle(testCase), oracles: formOracles(testCase, config) });
  return steps;
}

/** Fieldless update forms with a labelled submit: "Mark done" → "Mark undone". */
function isStateChangeForm(testCase: FormCase): boolean {
  return testCase.form.fields.length === 0 && testCase.form.crudOp === 'update' && testCase.variant.name === 'valid' && Boolean(testCase.form.submit.text);
}

// A GET form that names its own target is a real navigation, so its values must reach the URL; one
// with neither `method` nor `action` is script-handled and promises nothing about the URL.
function echoesQuery(testCase: FormCase): boolean {
  return testCase.form.method === 'GET' && testCase.variant.name === 'valid' && testCase.form.declaresTarget;
}

function outcomeStepTitle(testCase: FormCase): string {
  if (testCase.variant.name === 'delete') return 'Expect the record to be gone';
  if (testCase.variant.outcome === 'error') return 'Expect a validation error';
  if (testCase.variant.outcome === 'graceful') return 'Expect no server error';
  if (isStateChangeForm(testCase)) return 'Expect the state to have changed';
  if (echoesQuery(testCase)) return 'Expect the filters in the URL';
  return 'Expect the submission to succeed';
}

export function fieldVar(name: string): string {
  return `f_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * One runtime variable per field name: repeated names (`items[]`) share it, and names that differ
 * only in punctuation (`user.name`, `user_name`) get distinct ones.
 */
function variableNames(form: Form): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const field of form.fields) {
    if (names.has(field.name)) continue;
    const base = fieldVar(field.name);
    let candidate = base;
    for (let next = 2; taken.has(candidate); next += 1) candidate = `${base}_${next}`;
    taken.add(candidate);
    names.set(field.name, candidate);
  }
  return names;
}

function variableOf(form: Form, name: string): ValueRef {
  return { kind: 'var', name: variableNames(form).get(name) ?? fieldVar(name) };
}

function fillPlan(testCase: FormCase): { decls: Step[]; fills: Fill[] } {
  const { form, values } = testCase;

  // Resolve runtime/ref fields to a variable (or a referenced literal) and collect their decls.
  const decls: Step[] = [];
  const runtimeFill = new Map<string, ValueRef>();
  const names = variableNames(form);
  for (const field of form.fields) {
    const fieldValue = values[field.name];
    if (fieldValue === undefined || runtimeFill.has(field.name)) continue;
    if (fieldValue.kind === 'runtime') {
      // A radio is picked, never typed into, so it needs no value of its own.
      if (field.type === 'radio') continue;
      const variable = names.get(field.name) ?? fieldVar(field.name);
      decls.push({ kind: 'declare', name: variable, expr: fieldValue.expr });
      runtimeFill.set(field.name, { kind: 'var', name: variable });
    } else if (fieldValue.kind === 'ref') {
      const source = values[fieldValue.name];
      if (source?.kind === 'runtime') runtimeFill.set(field.name, variableOf(form, fieldValue.name));
      else if (source?.kind === 'literal') runtimeFill.set(field.name, { kind: 'literal', value: source.value });
    }
  }

  const fills = form.fields.flatMap((field): Fill[] => {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) return [];
    const target = field.locator;
    const isBlankTarget = testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty';
    if (field.type === 'radio') {
      if (isBlankTarget) return [{ kind: 'uncheck-radios', name: field.name }];
      const value = fieldValue.kind === 'literal' ? fieldValue.value : '';
      if (shouldForceInvalidOption(testCase, field)) return [{ kind: 'force-radio', name: field.name, value }];
      return [{ kind: 'check', target: field.options?.length ? radioOption(field.name, value) : target }];
    }
    const runtimeValue = runtimeFill.get(field.name);
    if (runtimeValue !== undefined && fieldValue.kind !== 'literal') return [{ kind: 'type', target, value: runtimeValue }];
    const value = fieldValue.kind === 'literal' ? fieldValue.value : '';
    // File pickers cannot be typed into: the literal is a MIME type → upload a fixture of it, or
    // clear the selection for the required-empty negative.
    if (field.type === 'file') return [value === '' ? { kind: 'clear-file', target } : { kind: 'upload', target, mimeType: value }];
    if (shouldForceInvalidOption(testCase, field)) return [{ kind: 'force-option', target, value }];
    if (field.options?.length && isBlankTarget) return [{ kind: 'clear-select', target }];
    if (shouldForceValue(testCase, field)) return [{ kind: 'force-value', target, value }];
    if (field.type === 'checkbox') return [{ kind: 'set-checked', target, checked: value === 'on' || value === 'true' }];
    if (field.options?.length) return [{ kind: 'select-option', target, value }];
    return [{ kind: 'type', target, value: { kind: 'literal', value } }];
  });

  return { decls, fills };
}

/** The radio of group `name` that carries `value`. */
function radioOption(name: string, value: string): Locator {
  return { strategy: 'css', value: `input[type="radio"][name="${escapeAttrValue(name)}"][value="${escapeAttrValue(value)}"]` };
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
  const formSelector = formSelectorOf(testCase.form);
  const accepted: Oracle = { type: 'no-validation-error', errorSelector: config.oracle.errorSelector };
  if (testCase.form.crudOp === 'delete' && testCase.variant.name === 'delete') {
    // The deleted entity's form action is unique per row, so its disappearance proves the delete
    // took effect. Row counting is deliberately avoided: on paginated listings the page size stays
    // constant after a delete, and hard-coding the redirect URL would leak app-specific paths.
    return [{ type: 'record-gone', formSelector }, { type: 'body-graceful' }];
  }
  if (testCase.variant.outcome === 'error' && testCase.targetField) {
    return [errorOracle(testCase.form, testCase.targetField, config.oracle.errorSelector, testCase.page.url, testCase.variant.name)];
  }
  if (testCase.variant.outcome === 'graceful') {
    // Padded and omitted values are legitimate input; very long or exotic ones may be refused.
    const legitimate = ['whitespace', 'optional-omitted'].includes(testCase.variant.name);
    return legitimate ? [{ type: 'body-graceful' }, accepted] : [{ type: 'body-graceful' }];
  }
  if (isStateChangeForm(testCase)) return [{ type: 'state-flipped', formSelector }];
  if (echoesQuery(testCase)) {
    const params = submittedParams(testCase);
    if (params.length > 0) return [{ type: 'query-echo', path: new URL(testCase.form.action, config.baseUrl).pathname, params }];
  }
  const representative = representativeTextValue(testCase);
  // Only the canonical happy path asserts the stored value: other success-outcome variants
  // (maxlength-exact) submit values a list view may legitimately truncate.
  if (representative && testCase.variant.name === 'valid' && (testCase.form.crudOp === 'create' || testCase.form.crudOp === 'update')) {
    const { field, value } = representative;
    // An edit form shows the record's values, so reopening it proves the update wherever the
    // record is listed; a created record is looked up where the app sends the user.
    return testCase.form.crudOp === 'update' && field.prefilled
      ? [accepted, { type: 'value-persisted', url: testCase.page.url, target: field.locator, value }]
      : [{ type: 'text-visible', value }, accepted];
  }
  return testCase.variant.outcome === 'success' ? [{ type: 'body-graceful' }, accepted] : [{ type: 'body-graceful' }];
}

/**
 * The error oracle branches on how the form validates: `novalidate` (or a constraint the field
 * does not carry natively) → the server re-renders with an error indicator on the form URL;
 * otherwise HTML5 constraint validation blocks the submit and the field reports `validity.valid`
 * false. Never a message text.
 */
export function errorOracle(form: Form, field: Field, errorSelector: string, expectedPath?: string, variantName?: string): Oracle {
  if (form.noValidate || !nativelyObservable(field, variantName)) {
    // Anchored after the origin: `/todos` must not also match `/admin/todos`.
    return { type: 'server-error', errorSelector, urlPattern: `^[^:]+://[^/]+${escapeRegExp(expectedPath ?? form.action)}(?:[?#].*)?$` };
  }
  return { type: 'native-invalid', target: field.locator };
}

/**
 * Whether the violated constraint exists natively on the field, so constraint validation
 * (validity.valid) can observe it. Otherwise only the app's own error display can show it:
 * a `required-empty` forced via `data.requiredFields` on a field without `required` (SauceDemo's
 * checkout fields), a value already taken, a mismatching confirmation, and a malformed phone
 * number on a field with no `pattern` (browsers do not check `type=tel`).
 */
function nativelyObservable(field: Field, variantName?: string): boolean {
  if (variantName === 'required-empty') return field.required;
  if (variantName === 'duplicate' || variantName === 'confirmation-mismatch') return false;
  if (variantName === 'tel-format') return field.constraints.pattern !== null;
  return true;
}

/** The values a GET form submits, in field order. */
function submittedParams(testCase: FormCase): { name: string; value: ValueRef }[] {
  const entries: { name: string; value: ValueRef }[] = [];
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue === undefined || ['file', 'checkbox', 'radio'].includes(field.type)) continue;
    if (entries.some((entry) => entry.name === field.name)) continue;
    if (fieldValue.kind === 'runtime') entries.push({ name: field.name, value: variableOf(testCase.form, field.name) });
    else if (fieldValue.kind === 'literal') entries.push({ name: field.name, value: { kind: 'literal', value: fieldValue.value } });
    else {
      const source = testCase.values[fieldValue.name];
      if (source?.kind === 'runtime') entries.push({ name: field.name, value: variableOf(testCase.form, fieldValue.name) });
      else if (source?.kind === 'literal') entries.push({ name: field.name, value: { kind: 'literal', value: source.value } });
    }
  }
  return entries;
}

// The submitted value the app should keep after a successful create/update — asserting it
// is what makes the positive oracle prove persistence (a redirect alone also happens when the
// server silently drops the write). Prefer a faker-generated text field (unique by
// construction); fall back to a config-pinned literal text value. Textarea fields are excluded
// because their content is rarely rendered in list/summary views.
function representativeTextValue(testCase: FormCase): { field: Field; value: ValueRef } | null {
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'runtime' && ['text', 'search'].includes(field.type)) return { field, value: variableOf(testCase.form, field.name) };
  }
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'literal' && fieldValue.value.trim().length >= 3 && ['text', 'search'].includes(field.type)) {
      return { field, value: { kind: 'literal', value: fieldValue.value } };
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
    ...(landing ? [landingStep(landing)] : []),
    { kind: 'assert', title: 'Expect no server error', oracles: [{ type: 'no-server-error' }] },
  ];
}

/**
 * Landing on a link's target. A target carrying a record id (a row's "Edit" link) is checked by its
 * route shape: which record comes first depends on the app's data order, not on the link working.
 */
function landingStep(path: string): Step {
  const shape = routeShape(path);
  if (shape === path) return { kind: 'assert', title: `Expect to land on ${path}`, oracles: [{ type: 'landed', path, withSearch: false }] };
  return { kind: 'assert', title: `Expect to land on ${shape}`, oracles: [{ type: 'landed-shape', pattern: shapePattern(path) }] };
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
