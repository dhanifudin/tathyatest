import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TathyaConfig } from '../config.js';
import type { Field } from '../crawl.js';
import { locatorSource } from '../locator.js';
import { errorAssertionSource, gracefulAssertionSource } from '../oracle.js';
import type { TestCase } from '../mapper.js';

export async function emitTs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  await resetOutput(config.output.dir);
  await writeFile(join(config.output.dir, 'auth', 'auth.spec.ts'), authSpec(cases, config));
  await writeFile(join(config.output.dir, 'forms', 'forms.spec.ts'), formSpec(cases, config));
  await writeFile(join(config.output.dir, 'interactions', 'interactions.spec.ts'), interactionSpec(cases, config));
  await writeFile(join(config.output.dir, 'pagination', 'pagination.spec.ts'), paginationSpec(cases, config));
  await writeFile(join(config.output.dir, 'rbac', 'rbac.spec.ts'), rbacSpec(cases, config));
}

async function resetOutput(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'auth'), { recursive: true });
  await mkdir(join(dir, 'forms'), { recursive: true });
  await mkdir(join(dir, 'interactions'), { recursive: true });
  await mkdir(join(dir, 'pagination'), { recursive: true });
  await mkdir(join(dir, 'rbac'), { recursive: true });
}

function header(): string {
  return `import { test, expect } from '@playwright/test';\n\n`;
}

function fakerPreamble(config: TathyaConfig): string {
  const { locale, seed } = config.data.faker;
  const importLine = locale && locale !== 'en'
    ? `import { allFakers } from '@faker-js/faker';\nconst faker = allFakers[${JSON.stringify(locale)}] ?? allFakers['en'];\n`
    : `import { faker } from '@faker-js/faker';\n`;
  const seedLine = seed !== null && seed !== undefined ? `test.beforeAll(() => { faker.seed(${seed}); });\n` : '';
  return `${importLine}${seedLine}\n`;
}

function fieldVar(name: string): string {
  return `f_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function authSpec(cases: TestCase[], config: TathyaConfig): string {
  const authCases = cases.filter((testCase) => testCase.kind === 'auth');
  return header() + loginHelperSource(config) + `test.use({ storageState: { cookies: [], origins: [] } });\n\n` + authCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await performLogin(page, ${JSON.stringify(testCase.username)}, ${JSON.stringify(testCase.password)});
  ${testCase.expectSuccess ? 'await assertLoginSucceeded(page);' : `await expect(page.locator(${JSON.stringify(config.oracle.errorSelector)}).first()).toBeVisible();`}
});`).join('\n\n') + '\n';
}

function formSpec(cases: TestCase[], config: TathyaConfig): string {
  const formCases = cases.filter((testCase) => testCase.kind === 'form');
  return header() + fakerPreamble(config) + roleLoginHelpers(config) + formCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  await page.goto(${JSON.stringify(testCase.page.url)});
${fillFormSource(testCase)}
${submitClickSource(testCase)}
  ${formAssertion(testCase, config)}
});`).join('\n\n') + '\n';
}

/**
 * Click the form's submit control, scoped to the owning form when it can be identified by its
 * action attribute. Pages with one form per table row (toggle/delete) repeat the same accessible
 * button name, so an unscoped getByRole click violates strict mode; scoping by action keeps the
 * click on the intended form. Falls back to `.first()` for forms without a usable action
 * attribute (e.g. SPA forms that submit via JS).
 */
function submitClickSource(testCase: Extract<TestCase, { kind: 'form' }>): string {
  const lines: string[] = [];
  if (testCase.variant.name === 'delete') {
    // Accept a potential confirm() dialog; Playwright dismisses dialogs by default, which would
    // silently cancel the destructive action.
    lines.push(`  page.once('dialog', (dialog) => { dialog.accept().catch(() => undefined); });`);
  }
  lines.push(
    `  const formScope = page.locator(${JSON.stringify(formActionSelector(testCase.form.action))});`,
    `  const submitControl = (await formScope.count()) > 0 ? ${locatorSource(testCase.form.submit.locator, 'formScope.first()')} : ${locatorSource(testCase.form.submit.locator)}.first();`,
    // Mirrors the interaction-spec convention: controls hidden behind collapsed menus/dropdowns
    // (e.g. a logout form inside a nav dropdown) are skipped, not failed.
    `  test.skip(!(await submitControl.isVisible().catch(() => false)), 'submit control is not visible');`,
    `  await submitControl.click();`,
  );
  return lines.join('\n');
}

// Attribute suffix match: the crawler normalizes form.action to pathname+search while the DOM
// attribute may be an absolute URL or a relative path.
function formActionSelector(action: string): string {
  return `form[action$="${action.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

function interactionSpec(cases: TestCase[], config: TathyaConfig): string {
  const interactionCases = cases.filter((testCase) => testCase.kind === 'interaction');
  return header() + roleLoginHelpers(config) + interactionCases.map((testCase) => {
    const { interaction } = testCase;
    const action = interaction.type === 'select' && interaction.optionValue !== undefined
      ? `await target.selectOption(${JSON.stringify(interaction.optionValue)});`
      : 'await target.click();';
    return `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  await page.goto(${JSON.stringify(testCase.page.url)});
  const target = ${locatorSource(interaction.locator)}.nth(${interaction.ordinal});
  test.skip(await target.count() === 0 || !(await target.isVisible().catch(() => false)), 'interaction target is not visible');
  ${action}
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);
});`;
  }).join('\n\n') + '\n';
}

function paginationSpec(cases: TestCase[], config: TathyaConfig): string {
  const paginationCases = cases.filter((testCase) => testCase.kind === 'pagination');
  return header() + roleLoginHelpers(config) + paginationCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  await page.goto(${JSON.stringify(testCase.page.url)});
  const target = ${locatorSource(testCase.pagination.locator)}.nth(${testCase.pagination.ordinal});
  test.skip(await target.count() === 0 || !(await target.isVisible().catch(() => false)), 'pagination target is not visible');
  const beforePath = new URL(page.url()).pathname + new URL(page.url()).search;
  await target.click();
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  ${testCase.pagination.href ? `await expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(new URL(${JSON.stringify(testCase.pagination.href)}, ${JSON.stringify(config.baseUrl)}).pathname + new URL(${JSON.stringify(testCase.pagination.href)}, ${JSON.stringify(config.baseUrl)}).search);` : ''}
  await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);
});`).join('\n\n') + '\n';
}

function rbacSpec(cases: TestCase[], config: TathyaConfig): string {
  const rbacCases = cases.filter((testCase) => testCase.kind === 'rbac');
  return header() + roleLoginHelpers(config) + rbacCases.map((testCase) => {
    if (testCase.expectAllowed) {
      // Allowed = a healthy (< 400) document response, OR — because SPA hosts serve deep links
      // with an error status while the client router still renders the page — staying on the
      // route with interactive content rendered. A genuine error page (e.g. Laravel's 404, which
      // renders nothing interactive) fails both arms; the graceful body check catches debug 500s.
      const routePath = new URL(testCase.route, 'http://placeholder.local').pathname;
      return `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  const response = await page.goto(${JSON.stringify(testCase.route)});
  const status = response?.status() ?? 200;
  if (status >= 400) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    expect(new URL(page.url()).pathname).toBe(${JSON.stringify(routePath)});
    expect(await page.locator('a, button, form, select, input').count()).toBeGreaterThan(0);
  }
  await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);
});`;
    }
    // Blocked route: `page.goto` resolves redirect chains, so a redirect-away denial ends with a
    // 2xx on a DIFFERENT path. Assert either a direct denial status (>= 400) or that the browser
    // never landed on the blocked path — plus a graceful (no-500) body either way.
    const blockedPath = new URL(testCase.route, 'http://placeholder.local').pathname;
    return `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  const response = await page.goto(${JSON.stringify(testCase.route)});
  const status = response?.status() ?? 200;
  if (status < 400) {
    expect(new URL(page.url()).pathname).not.toBe(${JSON.stringify(blockedPath)});
  } else {
    expect([401, 403, 404]).toContain(status);
  }
  await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);
});`;
  }).join('\n\n') + '\n';
}

function roleLoginHelpers(config: TathyaConfig): string {
  return roleLoginHelpersFromEntries(
    config,
    config.auth.roles.map((role) => [role.name, { username: role.username, password: role.password }] as const),
  );
}

function roleLoginHelpersFromEntries(
  config: Pick<TathyaConfig, 'auth'>,
  entries: Array<readonly [string, { username: string; password: string }]>,
): string {
  const credentials = Object.fromEntries(entries);
  return loginHelperSource(config) + `const roleCredentials = ${JSON.stringify(credentials, null, 2)};\n\nasync function resetAndLogin(page: import('@playwright/test').Page, role: keyof typeof roleCredentials) {
  await page.request.post('/__testing/reset');
  await page.context().clearCookies();
  const credentials = roleCredentials[role];
  await performLogin(page, credentials.username, credentials.password);
  await assertLoginSucceeded(page);
}\n\n`;
}

function loginHelperSource(config: Pick<TathyaConfig, 'auth'>): string {
  return `type LoginLocator = { strategy: 'testid' | 'role' | 'label' | 'placeholder' | 'id' | 'name' | 'css'; value: string };
type LoginControls = { username: LoginLocator; password: LoginLocator; submit: LoginLocator };

function loginLocator(page: import('@playwright/test').Page, locator: LoginLocator) {
  switch (locator.strategy) {
    case 'testid':
      return page.getByTestId(locator.value);
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      return name ? page.getByRole(role as Parameters<typeof page.getByRole>[0], { name }) : page.getByRole(role as Parameters<typeof page.getByRole>[0]);
    }
    case 'label':
      return page.getByLabel(locator.value, { exact: true });
    case 'placeholder':
      return page.getByPlaceholder(locator.value);
    case 'id':
      return page.locator('#' + cssEscape(locator.value));
    case 'name':
      return page.locator('[name="' + cssEscape(locator.value) + '"]');
    case 'css':
      return page.locator(locator.value);
  }
}

async function performLogin(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto(${JSON.stringify(config.auth.loginPath)});
  const controls = await inferLoginControls(page);
  await loginLocator(page, controls.username).fill(username);
  await loginLocator(page, controls.password).fill(password);
  const beforePath = new URL(page.url()).pathname;
  await Promise.all([
    page.waitForURL((url) => url.pathname !== beforePath, { timeout: 5000 }).catch(() => undefined),
    loginLocator(page, controls.submit).click(),
  ]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function assertLoginSucceeded(page: import('@playwright/test').Page) {
  const loginPath = new URL(${JSON.stringify(config.auth.loginPath)}, 'http://tathyatest.local').pathname;
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== loginPath) return;
  await expect(page.locator('input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"], input[placeholder*="Password"]').first()).not.toBeVisible();
}

async function inferLoginControls(page: import('@playwright/test').Page): Promise<LoginControls> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return page.evaluate(() => {
    type Candidate = {
      tag: 'input' | 'button';
      type: string;
      name: string;
      id: string;
      placeholder: string;
      autocomplete: string;
      ariaLabel: string;
      dataAttr: string;
      dataValue: string;
      text: string;
      value: string;
    };
    const attr = (el: Element, name: string): string => el.getAttribute(name) ?? '';
    const text = (el: Element): string => (el.textContent ?? '').replace(/\\s+/g, ' ').trim();
    const candidateText = (candidate: Candidate): string => [
      candidate.type,
      candidate.name,
      candidate.id,
      candidate.placeholder,
      candidate.autocomplete,
      candidate.ariaLabel,
      candidate.dataValue,
      candidate.text,
      candidate.value,
    ].join(' ').toLowerCase();
    const stableId = (value: string): boolean => value.length > 0 && !/[0-9a-f]{8,}|:/.test(value);
    const cssEscape = (value: string): string => {
      const escaper = (globalThis as typeof globalThis & { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
      return escaper ? escaper(value) : value.replace(/["\\\\]/g, '\\\\$&');
    };
    const inputCandidate = (input: HTMLInputElement): Candidate => ({
      tag: 'input',
      type: (input.type || 'text').toLowerCase(),
      name: input.name,
      id: input.id,
      placeholder: input.placeholder,
      autocomplete: input.autocomplete,
      ariaLabel: attr(input, 'aria-label'),
      dataAttr: attr(input, 'data-test') ? 'data-test' : attr(input, 'data-testid') ? 'data-testid' : '',
      dataValue: attr(input, 'data-test') || attr(input, 'data-testid'),
      text: '',
      value: input.value,
    });
    const buttonCandidate = (button: HTMLButtonElement | HTMLInputElement): Candidate => ({
      tag: button.tagName.toLowerCase() === 'button' ? 'button' : 'input',
      type: (attr(button, 'type') || (button instanceof HTMLButtonElement ? 'submit' : 'text')).toLowerCase(),
      name: attr(button, 'name'),
      id: attr(button, 'id'),
      placeholder: attr(button, 'placeholder'),
      autocomplete: attr(button, 'autocomplete'),
      ariaLabel: attr(button, 'aria-label'),
      dataAttr: attr(button, 'data-test') ? 'data-test' : attr(button, 'data-testid') ? 'data-testid' : '',
      dataValue: attr(button, 'data-test') || attr(button, 'data-testid'),
      text: button instanceof HTMLInputElement ? '' : text(button),
      value: button instanceof HTMLInputElement ? button.value : attr(button, 'value'),
    });
    const locatorFor = (candidate: Candidate | undefined, kind: 'username' | 'password' | 'submit'): LoginLocator => {
      if (!candidate) {
        if (kind === 'submit') return { strategy: 'css', value: 'button[type="submit"], input[type="submit"], button:not([type])' };
        return { strategy: 'css', value: kind === 'username' ? 'input:not([type="hidden"]):not([type="password"])' : 'input[type="password"]' };
      }
      if (candidate.dataAttr && candidate.dataValue) return { strategy: 'css', value: '[' + candidate.dataAttr + '="' + cssEscape(candidate.dataValue) + '"]' };
      if (candidate.placeholder) return { strategy: 'placeholder', value: candidate.placeholder };
      if (stableId(candidate.id)) return { strategy: 'id', value: candidate.id };
      if (candidate.name) return { strategy: 'name', value: candidate.name };
      const buttonText = candidate.text || candidate.value;
      if (candidate.tag === 'button' && buttonText) return { strategy: 'role', value: 'button:' + buttonText };
      return { strategy: 'css', value: candidate.tag === 'button' ? 'button' : 'input' };
    };
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
      .map(inputCandidate)
      .filter((input) => !['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(input.type));
    const buttons = [
      ...Array.from(document.querySelectorAll<HTMLButtonElement>('button')).map(buttonCandidate),
      ...Array.from(document.querySelectorAll<HTMLInputElement>('input[type="submit"], input[type="button"]')).map(buttonCandidate),
    ];
    const username = inputs
      .map((input) => {
        const haystack = candidateText(input);
        let score = 0;
        if (input.type === 'email') score += 100;
        if (input.autocomplete.toLowerCase() === 'username') score += 90;
        if (input.autocomplete.toLowerCase() === 'email') score += 80;
        if (/(email|username|user|account|identifier|handle)/.test(haystack)) score += 50;
        return { input, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.input ?? inputs[0];
    const password = inputs
      .map((input) => {
        const haystack = candidateText(input);
        let score = 0;
        if (input.type === 'password') score += 100;
        if (/(password|passcode|pin)/.test(haystack)) score += 50;
        return { input, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.input ?? inputs.find((input) => input !== username) ?? inputs[1] ?? inputs[0];
    const submit = buttons
      .map((button) => {
        const haystack = candidateText(button);
        let score = 0;
        if (button.dataValue) score += 100;
        if (button.tag === 'button') score += 20;
        if (/(log in|login|sign in|sign-in)/.test(haystack)) score += 50;
        if (button.type === 'submit') score += 10;
        return { button, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.button ?? buttons[0];
    return {
      username: locatorFor(username, 'username'),
      password: locatorFor(password, 'password'),
      submit: locatorFor(submit, 'submit'),
    };
  });
}

function cssEscape(value: string): string {
  return value.replaceAll('\\\\', '\\\\\\\\').replaceAll('"', '\\\\"');
}

`;
}

function fillFormSource(testCase: Extract<TestCase, { kind: 'form' }>): string {
  const { form, values } = testCase;

  // Resolve runtime/ref fields to a variable (or a referenced literal) and collect their decls.
  const decls: string[] = [];
  const runtimeFill = new Map<string, string>();
  for (const field of form.fields) {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) continue;
    if (fieldValue.kind === 'runtime') {
      const variable = fieldVar(field.name);
      decls.push(`  const ${variable} = ${fieldValue.expr};`);
      runtimeFill.set(field.name, variable);
    } else if (fieldValue.kind === 'ref') {
      const source = values[fieldValue.name];
      if (source?.kind === 'runtime') runtimeFill.set(field.name, fieldVar(fieldValue.name));
      else if (source?.kind === 'literal') runtimeFill.set(field.name, JSON.stringify(source.value));
    }
  }

  const fills = form.fields.map((field) => {
    const fieldValue = values[field.name];
    if (fieldValue === undefined) return '';
    const loc = locatorSource(field.locator);
    const runtimeExpr = runtimeFill.get(field.name);
    if (runtimeExpr !== undefined && fieldValue.kind !== 'literal') {
      return `  await ${loc}.fill(${runtimeExpr});`;
    }
    const value = fieldValue.kind === 'literal' ? fieldValue.value : '';
    if (field.type === 'radio') {
      if (testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty') {
        return `  await page.locator(${JSON.stringify(`[name="${field.name}"]`)}).evaluateAll((elements) => {
    for (const element of elements) {
      if (element instanceof HTMLInputElement && element.type === 'radio') {
        element.checked = false;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });`;
      }
      return `  await ${loc}.check();`;
    }
    if (shouldForceInvalidOption(testCase, field)) {
      return `  await ${loc}.evaluate((element, value) => {
    if (element instanceof HTMLSelectElement) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      element.appendChild(option);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, ${JSON.stringify(value)});`;
    }
    if (field.options?.length && testCase.targetField?.name === field.name && testCase.variant.name === 'required-empty') {
      return `  await ${loc}.evaluate((element) => {
    if (element instanceof HTMLSelectElement) {
      element.selectedIndex = -1;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });`;
    }
    if (shouldForceValue(testCase, field)) {
      return `  await ${loc}.evaluate((element, value) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, ${JSON.stringify(value)});`;
    }
    if (field.type === 'checkbox') return `  await ${loc}.setChecked(${JSON.stringify(value === 'on' || value === 'true')});`;
    if (field.options?.length) return `  await ${loc}.selectOption(${JSON.stringify(value)});`;
    return `  await ${loc}.fill(${JSON.stringify(value)});`;
  }).filter(Boolean).join('\n');

  return [decls.join('\n'), fills].filter(Boolean).join('\n');
}

function shouldForceValue(testCase: Extract<TestCase, { kind: 'form' }>, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'maxlength-plus-one' ||
    testCase.variant.name === 'very-long'
  );
}

function shouldForceInvalidOption(testCase: Extract<TestCase, { kind: 'form' }>, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'invalid-option' ||
    testCase.variant.forceInvalidOption === true
  );
}

function formAssertion(testCase: Extract<TestCase, { kind: 'form' }>, config: TathyaConfig): string {
  if (testCase.form.crudOp === 'delete' && testCase.variant.name === 'delete') {
    // The deleted entity's form action is unique per row, so its disappearance proves the delete
    // took effect. Row counting is deliberately avoided: on paginated listings the page size stays
    // constant after a delete, and hard-coding the redirect URL would leak app-specific paths.
    return [
      `await expect(page.locator(${JSON.stringify(formActionSelector(testCase.form.action))})).toHaveCount(0);`,
      `await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);`,
    ].join('\n  ');
  }
  if (testCase.variant.outcome === 'error' && testCase.targetField) {
    return errorAssertionSource(testCase.form, testCase.targetField, config.oracle.errorSelector, testCase.page.url, testCase.variant.name).replaceAll('\n', '\n  ');
  }
  if (testCase.variant.outcome === 'graceful') return gracefulAssertionSource();
  const representative = representativeTextValue(testCase);
  // Only the canonical happy path asserts the echoed value: other success-outcome variants
  // (maxlength-exact, optional-omitted) submit values a list view may legitimately truncate.
  if (representative && testCase.variant.name === 'valid' && (testCase.form.crudOp === 'create' || testCase.form.crudOp === 'update')) {
    return `await expect(page.getByText(${representative}).first()).toBeVisible();`;
  }
  return "await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);";
}

// The submitted value the app should echo back after a successful create/update — asserting it
// is what makes the positive oracle prove persistence (a redirect alone also happens when the
// server silently drops the write). Prefer a faker-generated text field (unique by
// construction); fall back to a config-pinned literal text value. Textarea fields are excluded
// because their content is rarely rendered in list/summary views.
function representativeTextValue(testCase: Extract<TestCase, { kind: 'form' }>): string | null {
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
