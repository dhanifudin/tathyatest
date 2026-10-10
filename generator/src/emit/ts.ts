import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TathyaConfig } from '../config.js';
import type { Field } from '../crawl.js';
import { locatorSource } from '../locator.js';
import { caseMeta } from '../manifest.js';
import { errorAssertionSource, gracefulAssertionSource } from '../oracle.js';
import type { TestCase } from '../mapper.js';
import { routeShape } from '../rbac.js';
import { GENERATED_HEADER, SUPPORT_IMPORT, SUPPORT_MODULE_PATH, supportModuleSource } from './support.js';

type FormCase = Extract<TestCase, { kind: 'form' }>;

/**
 * Write the TypeScript suite: one shared `support/tathya.ts` plus one spec file per category and
 * route shape (`forms/todos-create.spec.ts`, `rbac/admin-users.spec.ts`, …). Specs import their
 * helpers from the support module, group tests in `describe` blocks per role and page, gate the
 * role once per group, narrate phases with `test.step`, and carry tags/annotations so a run can
 * be filtered with `--grep @negative`, `--grep @role:admin`, etc.
 */
export async function emitTs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  await resetOutput(config.output.dir);
  for (const [path, source] of specFilesFor(cases, config)) {
    const target = join(config.output.dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
}

async function resetOutput(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/** Pure: every file of the suite, keyed by its path inside `output.dir`. */
export function specFilesFor(cases: TestCase[], config: TathyaConfig): Map<string, string> {
  const files = new Map<string, string>();
  files.set(SUPPORT_MODULE_PATH, supportModuleSource(config));
  const groups = new Map<string, TestCase[]>();
  for (const testCase of cases) {
    const path = specPathFor(testCase);
    const group = groups.get(path);
    if (group) group.push(testCase);
    else groups.set(path, [testCase]);
  }
  for (const [path, group] of groups) files.set(path, specSource(group, config));
  return files;
}

/** `auth/login.spec.ts`, `forms/todos-create.spec.ts`, `rbac/admin-users.spec.ts`, … */
export function specPathFor(testCase: TestCase): string {
  switch (testCase.kind) {
    case 'auth':
      return 'auth/login.spec.ts';
    case 'form':
      return `forms/${routeSlug(testCase.page.url)}.spec.ts`;
    case 'interaction':
      return `interactions/${routeSlug(testCase.page.url)}.spec.ts`;
    case 'pagination':
      return `pagination/${routeSlug(testCase.page.url)}.spec.ts`;
    case 'rbac':
      return `rbac/${routeSlug(testCase.route)}.spec.ts`;
  }
}

function routeSlug(url: string): string {
  const slug = routeShape(canonicalPath(url))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'root';
}

function canonicalPath(path: string): string {
  try {
    return new URL(path, 'http://tathyatest.local').pathname || '/';
  } catch {
    const [withoutQuery = '/'] = path.split(/[?#]/, 1);
    return withoutQuery || '/';
  }
}

// ---------------------------------------------------------------------------------------------
// One spec file
// ---------------------------------------------------------------------------------------------

function specSource(group: TestCase[], config: TathyaConfig): string {
  const kind = group[0].kind;
  const parts: string[] = [GENERATED_HEADER, `import { ${helperImports(kind).join(', ')} } from '${SUPPORT_IMPORT}';\n`];
  if (kind === 'form') parts.push(fakerPreamble(config));
  // Login tests must start logged out: the role projects pre-authenticate via storageState.
  if (kind === 'auth') parts.push(`\ntest.use({ storageState: { cookies: [], origins: [] } });\n`);

  for (const [role, roleCases] of groupBy(group, (testCase) => testCase.role)) {
    parts.push(`\ntest.describe(${q(describeTitle(roleCases[0]))}, () => {\n`);
    parts.push(`  test.skip(({ role }) => role !== ${q(role)}, ${q(`runs under the ${role} project only`)});\n`);
    if (kind === 'form') {
      for (const [, formCases] of groupBy(roleCases as FormCase[], (testCase) => formGroupKey(testCase))) {
        parts.push(`\n  test.describe(${q(formDescribeTitle(formCases[0]))}, () => {\n`);
        for (const testCase of formCases) parts.push(indent(testSource(testCase, config), 4), '\n');
        parts.push('  });\n');
      }
    } else {
      for (const testCase of roleCases) parts.push('\n', indent(testSource(testCase, config), 2), '\n');
    }
    parts.push('});\n');
  }
  return parts.join('');
}

function helperImports(kind: TestCase['kind']): string[] {
  switch (kind) {
    case 'auth':
      return ['test', 'performLogin', 'assertLoggedIn', 'assertLoginRejected'];
    case 'form':
      return ['test', 'expect'];
    case 'interaction':
    case 'pagination':
      return ['test', 'expect', 'expectNoServerError'];
    case 'rbac':
      return ['test', 'expectRouteAllowed', 'expectRouteBlocked'];
  }
}

function describeTitle(testCase: TestCase): string {
  switch (testCase.kind) {
    case 'auth':
      return `${testCase.role} login`;
    case 'rbac':
      return `${testCase.role} · ${canonicalPath(testCase.route)}`;
    default:
      return `${testCase.role} · ${canonicalPath(testCase.page.url)}`;
  }
}

function formGroupKey(testCase: FormCase): string {
  return `${testCase.form.method} ${canonicalPath(testCase.form.action)} ${testCase.form.submit.text ?? ''}`;
}

function formDescribeTitle(testCase: FormCase): string {
  const label = testCase.form.submit.text ? `"${testCase.form.submit.text}" form` : 'form';
  return `${label} → ${testCase.form.method} ${canonicalPath(testCase.form.action)}`;
}

function fakerPreamble(config: TathyaConfig): string {
  const { locale, seed } = config.data.faker;
  const importLine = locale && locale !== 'en'
    ? `import { allFakers } from '@faker-js/faker';\nconst faker = allFakers[${JSON.stringify(locale)}] ?? allFakers['en'];\n`
    : `import { faker } from '@faker-js/faker';\n`;
  const seedLine = seed !== null && seed !== undefined ? `test.beforeAll(() => { faker.seed(${seed}); });\n` : '';
  return `${importLine}${seedLine}`;
}

// ---------------------------------------------------------------------------------------------
// One test
// ---------------------------------------------------------------------------------------------

function testSource(testCase: TestCase, config: TathyaConfig): string {
  switch (testCase.kind) {
    case 'auth':
      return authTest(testCase);
    case 'form':
      return formTest(testCase, config);
    case 'interaction':
      return interactionTest(testCase);
    case 'pagination':
      return paginationTest(testCase, config);
    case 'rbac':
      return rbacTest(testCase);
  }
}

/** `{ tag: [...], annotation: [...] }` from the same classification the manifest records. */
function testOptions(testCase: TestCase): string {
  const meta = caseMeta(testCase);
  const tags = [`@${meta.tier}`, `@${meta.category}`, `@role:${meta.role}`];
  const annotations: { type: string; description: string }[] = [
    { type: 'tier', description: meta.tier },
    { type: 'category', description: meta.category },
  ];
  if (meta.route) annotations.push({ type: 'route', description: meta.route });
  if (meta.targetField) annotations.push({ type: 'targetField', description: meta.targetField });
  if (meta.constraintKind) annotations.push({ type: 'constraintKind', description: meta.constraintKind });
  return `{ tag: ${JSON.stringify(tags)}, annotation: ${JSON.stringify(annotations)} }`;
}

function authTest(testCase: Extract<TestCase, { kind: 'auth' }>): string {
  const outcome = testCase.expectSuccess
    ? `await test.step('Expect to be logged in', () => assertLoggedIn(page));`
    : `await test.step('Expect the login to be rejected', () => assertLoginRejected(page));`;
  return `test(${q(testCase.title)}, ${testOptions(testCase)}, async ({ page }) => {
  await test.step(${q(`Log in as ${testCase.username}`)}, () => performLogin(page, ${q(testCase.username)}, ${q(testCase.password)}));
  ${outcome}
});`;
}

function formTest(testCase: FormCase, config: TathyaConfig): string {
  const { decls, fills } = fillFormSource(testCase);
  const lines = [
    `test(${q(testCase.title)}, ${testOptions(testCase)}, async ({ page, app }) => {`,
    `  await test.step(${q(`Log in as ${testCase.role}`)}, () => app.loginAs(${q(testCase.role)}));`,
    `  await test.step(${q(`Open ${testCase.page.url}`)}, () => page.goto(${q(testCase.page.url)}));`,
  ];
  if (decls.length > 0) lines.push(...decls.map((decl) => `  ${decl}`));
  if (fills.length > 0) {
    lines.push(`  await test.step('Fill the form', async () => {`, ...fills.map((fill) => indent(fill, 4)), '  });');
  }
  lines.push(`  await test.step('Submit', async () => {`, indent(submitClickSource(testCase), 4), '  });');
  lines.push(`  await test.step(${q(outcomeStepTitle(testCase))}, async () => {`, indent(formAssertion(testCase, config), 4), '  });');
  lines.push('});');
  return lines.join('\n');
}

function outcomeStepTitle(testCase: FormCase): string {
  if (testCase.variant.name === 'delete') return 'Expect the record to be gone';
  if (testCase.variant.outcome === 'error') return 'Expect a validation error';
  if (testCase.variant.outcome === 'graceful') return 'Expect no server error';
  return 'Expect the submission to succeed';
}

function interactionTest(testCase: Extract<TestCase, { kind: 'interaction' }>): string {
  const { interaction } = testCase;
  const action = interaction.type === 'select' && interaction.optionValue !== undefined
    ? `await test.step(${q(`Select "${interaction.optionValue}" in ${interaction.label}`)}, () => target.selectOption(${q(interaction.optionValue)}));`
    : `await test.step(${q(`Click ${interaction.type} "${interaction.label}"`)}, () => target.click());`;
  return `test(${q(testCase.title)}, ${testOptions(testCase)}, async ({ page, app }) => {
  await test.step(${q(`Log in as ${testCase.role}`)}, () => app.loginAs(${q(testCase.role)}));
  await test.step(${q(`Open ${testCase.page.url}`)}, () => page.goto(${q(testCase.page.url)}));
  const target = ${nth(locatorSource(interaction.locator), interaction.ordinal)};
  test.skip(await target.count() === 0 || !(await target.isVisible().catch(() => false)), 'interaction target is not visible');
  ${action}
  await test.step('Expect no server error', () => expectNoServerError(page));
});`;
}

function paginationTest(testCase: Extract<TestCase, { kind: 'pagination' }>, config: TathyaConfig): string {
  const { pagination } = testCase;
  const stepTitle = pagination.action === 'page' ? `Go to page ${pagination.label}` : `Go to the ${pagination.action} page`;
  const landing = pagination.href ? pathAndSearch(pagination.href, config.baseUrl) : null;
  const landingStep = landing
    ? `\n  await test.step(${q(`Expect to land on ${landing}`)}, () => expect(page).toHaveURL((url) => url.pathname + url.search === ${q(landing)}));`
    : '';
  return `test(${q(testCase.title)}, ${testOptions(testCase)}, async ({ page, app }) => {
  await test.step(${q(`Log in as ${testCase.role}`)}, () => app.loginAs(${q(testCase.role)}));
  await test.step(${q(`Open ${testCase.page.url}`)}, () => page.goto(${q(testCase.page.url)}));
  const target = ${nth(locatorSource(pagination.locator), pagination.ordinal)};
  test.skip(await target.count() === 0 || !(await target.isVisible().catch(() => false)), 'pagination target is not visible');
  await test.step(${q(stepTitle)}, () => target.click());${landingStep}
  await test.step('Expect no server error', () => expectNoServerError(page));
});`;
}

function rbacTest(testCase: Extract<TestCase, { kind: 'rbac' }>): string {
  const routePath = canonicalPath(testCase.route);
  const outcome = testCase.expectAllowed
    ? `await test.step('Expect the route to be allowed', () => expectRouteAllowed(page, response, ${q(routePath)}));`
    : `await test.step('Expect the route to be blocked', () => expectRouteBlocked(page, response, ${q(routePath)}));`;
  return `test(${q(testCase.title)}, ${testOptions(testCase)}, async ({ page, app }) => {
  await test.step(${q(`Log in as ${testCase.role}`)}, () => app.loginAs(${q(testCase.role)}));
  const response = await test.step(${q(`Open ${testCase.route}`)}, () => page.goto(${q(testCase.route)}));
  ${outcome}
});`;
}

// ---------------------------------------------------------------------------------------------
// Form bodies (fill, submit, assert)
// ---------------------------------------------------------------------------------------------

function fieldVar(name: string): string {
  return `f_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Click the form's submit control, scoped to the owning form when it can be identified by its
 * action attribute. Pages with one form per table row (toggle/delete) repeat the same accessible
 * button name, so an unscoped getByRole click violates strict mode; scoping by action keeps the
 * click on the intended form. Falls back to `.first()` for forms without a usable action
 * attribute (e.g. SPA forms that submit via JS).
 */
function submitClickSource(testCase: FormCase): string {
  const lines: string[] = [];
  if (testCase.variant.name === 'delete') {
    // Accept a potential confirm() dialog; Playwright dismisses dialogs by default, which would
    // silently cancel the destructive action.
    lines.push(`page.once('dialog', (dialog) => { dialog.accept().catch(() => undefined); });`);
  }
  lines.push(
    `const formScope = page.locator(${q(formActionSelector(testCase.form.action))});`,
    `const submitControl = (await formScope.count()) > 0 ? ${locatorSource(testCase.form.submit.locator, 'formScope.first()')} : ${locatorSource(testCase.form.submit.locator)}.first();`,
    // Controls hidden behind collapsed menus/dropdowns (e.g. a logout form inside a nav dropdown)
    // are skipped, not failed.
    `test.skip(!(await submitControl.isVisible().catch(() => false)), 'submit control is not visible');`,
    `await submitControl.click();`,
  );
  return lines.join('\n');
}

// Attribute suffix match: the crawler normalizes form.action to pathname+search while the DOM
// attribute may be an absolute URL or a relative path.
function formActionSelector(action: string): string {
  return `form[action$="${action.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

function fillFormSource(testCase: FormCase): { decls: string[]; fills: string[] } {
  const { form, values } = testCase;

  // Resolve runtime/ref fields to a variable (or a referenced literal) and collect their decls.
  const decls: string[] = [];
  const runtimeFill = new Map<string, string>();
  for (const field of form.fields) {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) continue;
    if (fieldValue.kind === 'runtime') {
      const variable = fieldVar(field.name);
      decls.push(`const ${variable} = ${fieldValue.expr};`);
      runtimeFill.set(field.name, variable);
    } else if (fieldValue.kind === 'ref') {
      const source = values[fieldValue.name];
      if (source?.kind === 'runtime') runtimeFill.set(field.name, fieldVar(fieldValue.name));
      else if (source?.kind === 'literal') runtimeFill.set(field.name, JSON.stringify(source.value));
    }
  }

  const fills = form.fields.flatMap((field) => {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) return [];
    const loc = locatorSource(field.locator);
    const runtimeExpr = runtimeFill.get(field.name);
    if (runtimeExpr !== undefined && fieldValue.kind !== 'literal') {
      return [`await ${loc}.fill(${runtimeExpr});`];
    }
    const value = fieldValue.kind === 'literal' ? fieldValue.value : '';
    if (field.type === 'radio') {
      if (testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty') {
        return [`await page.locator(${q(`[name="${field.name}"]`)}).evaluateAll((elements) => {
  for (const element of elements) {
    if (element instanceof HTMLInputElement && element.type === 'radio') {
      element.checked = false;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});`];
      }
      return [`await ${loc}.check();`];
    }
    if (shouldForceInvalidOption(testCase, field)) {
      return [`await ${loc}.evaluate((element, value) => {
  if (element instanceof HTMLSelectElement) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    element.appendChild(option);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(value)});`];
    }
    if (field.options?.length && testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty') {
      return [`await ${loc}.evaluate((element) => {
  if (element instanceof HTMLSelectElement) {
    element.selectedIndex = -1;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
});`];
    }
    if (shouldForceValue(testCase, field)) {
      return [`await ${loc}.evaluate((element, value) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(value)});`];
    }
    if (field.type === 'checkbox') return [`await ${loc}.setChecked(${JSON.stringify(value === 'on' || value === 'true')});`];
    if (field.options?.length) return [`await ${loc}.selectOption(${q(value)});`];
    return [`await ${loc}.fill(${q(value)});`];
  });

  return { decls, fills };
}

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

function formAssertion(testCase: FormCase, config: TathyaConfig): string {
  if (testCase.form.crudOp === 'delete' && testCase.variant.name === 'delete') {
    // The deleted entity's form action is unique per row, so its disappearance proves the delete
    // took effect. Row counting is deliberately avoided: on paginated listings the page size stays
    // constant after a delete, and hard-coding the redirect URL would leak app-specific paths.
    return [
      `await expect(page.locator(${q(formActionSelector(testCase.form.action))})).toHaveCount(0);`,
      gracefulAssertionSource(),
    ].join('\n');
  }
  if (testCase.variant.outcome === 'error' && testCase.targetField) {
    return errorAssertionSource(testCase.form, testCase.targetField, config.oracle.errorSelector, testCase.page.url, testCase.variant.name);
  }
  if (testCase.variant.outcome === 'graceful') return gracefulAssertionSource();
  const representative = representativeTextValue(testCase);
  // Only the canonical happy path asserts the echoed value: other success-outcome variants
  // (maxlength-exact, optional-omitted) submit values a list view may legitimately truncate.
  if (representative && testCase.variant.name === 'valid' && (testCase.form.crudOp === 'create' || testCase.form.crudOp === 'update')) {
    return `await expect(page.getByText(${representative}).first()).toBeVisible();`;
  }
  return gracefulAssertionSource();
}

// The submitted value the app should echo back after a successful create/update — asserting it
// is what makes the positive oracle prove persistence (a redirect alone also happens when the
// server silently drops the write). Prefer a faker-generated text field (unique by
// construction); fall back to a config-pinned literal text value. Textarea fields are excluded
// because their content is rarely rendered in list/summary views.
function representativeTextValue(testCase: FormCase): string | null {
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'runtime' && ['text', 'search'].includes(field.type)) {
      return fieldVar(field.name);
    }
  }
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'literal' && fieldValue.value.trim().length >= 3 && ['text', 'search'].includes(field.type)) {
      return JSON.stringify(fieldValue.value);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function q(value: string): string {
  return JSON.stringify(value);
}

function nth(locator: string, ordinal: number): string {
  return ordinal === 0 ? `${locator}.first()` : `${locator}.nth(${ordinal})`;
}

function pathAndSearch(href: string, baseUrl: string): string {
  const url = new URL(href, baseUrl);
  return `${url.pathname}${url.search}`;
}

function indent(source: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return source.split('\n').map((line) => (line.length > 0 ? pad + line : line)).join('\n');
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
