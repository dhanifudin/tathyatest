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
  await ${locatorSource(testCase.form.submit.locator)}${testCase.variant.name === 'delete' ? '.first()' : ''}.click();
  ${formAssertion(testCase, config)}
});`).join('\n\n') + '\n';
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
  return header() + roleLoginHelpers(config) + rbacCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  const response = await page.goto(${JSON.stringify(testCase.route)});
  ${testCase.expectAllowed ? "expect(response?.status() ?? 200).toBeLessThan(400);" : "expect([401, 403, 404, 302]).toContain(response?.status() ?? 302);"}
});`).join('\n\n') + '\n';
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
    const currentCount = testCase.page.tables[0]?.rowCount ?? 0;
    return [
      `await expect(page.locator('table tbody tr')).toHaveCount(${Math.max(currentCount - 1, 0)});`,
      `await expect(page).toHaveURL(/\\/todos(?:[?#].*)?$/);`,
    ].join('\n');
  }
  if (testCase.variant.outcome === 'error' && testCase.targetField) {
    return errorAssertionSource(testCase.form, testCase.targetField, config.oracle.errorSelector, testCase.page.url).replaceAll('\n', '\n  ');
  }
  if (testCase.variant.outcome === 'graceful') return gracefulAssertionSource();
  const representative = representativeTextField(testCase);
  if (representative && (testCase.form.crudOp === 'create' || testCase.form.crudOp === 'update')) {
    return `await expect(page.getByText(${fieldVar(representative)}).first()).toBeVisible();`;
  }
  return "await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);";
}

// First short free-text field (type 'text' or 'search') whose valid value is faker-generated.
// Its emitted const is the value the app should echo back after a successful create/update, so we
// assert it is visible. Textarea fields are excluded because their content is rarely rendered in
// list/summary views; the fallback body assertion is used instead.
function representativeTextField(testCase: Extract<TestCase, { kind: 'form' }>): string | null {
  for (const field of testCase.form.fields) {
    const fieldValue = testCase.values[field.name];
    if (fieldValue?.kind === 'runtime' && ['text', 'search'].includes(field.type)) {
      return field.name;
    }
  }
  return null;
}
