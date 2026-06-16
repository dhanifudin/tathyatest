import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TathyaConfig } from '../config.js';
import type { Field, Form } from '../crawl.js';
import { locatorSource } from '../locator.js';
import { errorAssertionSource, gracefulAssertionSource } from '../oracle.js';
import type { TestCase } from '../mapper.js';

export async function emitTs(cases: TestCase[], config: TathyaConfig): Promise<void> {
  await resetOutput(config.output.dir);
  await writeFile(join(config.output.dir, 'auth', 'auth.spec.ts'), authSpec(cases, config));
  await writeFile(join(config.output.dir, 'crud', 'crud.spec.ts'), crudSpec(cases, config));
  await writeFile(join(config.output.dir, 'rbac', 'rbac.spec.ts'), rbacSpec(cases, config));
}

async function resetOutput(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'auth'), { recursive: true });
  await mkdir(join(dir, 'crud'), { recursive: true });
  await mkdir(join(dir, 'rbac'), { recursive: true });
}

function header(): string {
  return `import { test, expect } from '@playwright/test';\n\n`;
}

function authSpec(cases: TestCase[], config: TathyaConfig): string {
  const authCases = cases.filter((testCase) => testCase.kind === 'auth');
  return header() + `test.use({ storageState: { cookies: [], origins: [] } });\n\n` + authCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await page.goto(${JSON.stringify(config.auth.loginPath)});
  await page.locator(${JSON.stringify(`[name="${config.auth.usernameField}"]`)}).fill(${JSON.stringify(testCase.username)});
  await page.locator(${JSON.stringify(`[name="${config.auth.passwordField}"]`)}).fill(${JSON.stringify(testCase.password)});
  await page.getByRole('button', { name: /log in|login|sign in/i }).click();
  ${testCase.expectSuccess ? "await expect(page).not.toHaveURL(/\\/login(?:[?#].*)?$/);" : `await expect(page.locator(${JSON.stringify(config.oracle.errorSelector)}).first()).toBeVisible();`}
});`).join('\n\n') + '\n';
}

function crudSpec(cases: TestCase[], config: TathyaConfig): string {
  const crudCases = cases.filter((testCase) => testCase.kind === 'crud');
  return header() + roleLoginHelpers(config) + crudCases.map((testCase) => `test(${JSON.stringify(testCase.title)}, async ({ page }) => {
  test.skip(!test.info().project.name.startsWith(${JSON.stringify(`${testCase.role}-`)}), 'role-specific test');
  await resetAndLogin(page, ${JSON.stringify(testCase.role)});
  await page.goto(${JSON.stringify(testCase.page.url)});
${fillFormSource(testCase)}
  await ${locatorSource(testCase.form.submit.locator)}${testCase.variant.name === 'delete' ? '.first()' : ''}.click();
  ${crudAssertion(testCase, config)}
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
  return `const roleCredentials = ${JSON.stringify(credentials, null, 2)};\n\nasync function resetAndLogin(page, role) {
  await page.request.post('/__testing/reset');
  const credentials = roleCredentials[role];
  await page.goto(${JSON.stringify(config.auth.loginPath)});
  await page.locator(${JSON.stringify(`[name="${config.auth.usernameField}"]`)}).fill(credentials.username);
  await page.locator(${JSON.stringify(`[name="${config.auth.passwordField}"]`)}).fill(credentials.password);
  await page.getByRole('button', { name: /log in|login|sign in/i }).click();
  await expect(page).toHaveURL(/\\/dashboard(?:[?#].*)?$/);
}\n\n`;
}

function fillFormSource(testCase: Extract<TestCase, { kind: 'crud' }>): string {
  const { form, values } = testCase;
  return form.fields.map((field) => {
    if (values[field.name] === undefined) return '';
    const loc = locatorSource(field.locator);
    const value = values[field.name];
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
}

function shouldForceValue(testCase: Extract<TestCase, { kind: 'crud' }>, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'maxlength-plus-one' ||
    testCase.variant.name === 'very-long'
  );
}

function shouldForceInvalidOption(testCase: Extract<TestCase, { kind: 'crud' }>, field: Field): boolean {
  return testCase.targetField?.name === field.name && (
    testCase.variant.name === 'invalid-option' ||
    testCase.variant.forceInvalidOption === true
  );
}

function crudAssertion(testCase: Extract<TestCase, { kind: 'crud' }>, config: TathyaConfig): string {
  if (testCase.variant.name === 'delete') {
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
  return "await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);";
}
