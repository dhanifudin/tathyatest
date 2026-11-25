import type { TathyaConfig } from '../../config.js';
import { groupBy } from '../../ir/layout.js';
import { escapeAttrValue } from '../../util/escape.js';
import { assertNever, type Fill, type Oracle, type Step, type SubmitTarget, type TestPlan, type ValueRef } from '../../ir/types.js';
import type { SpecEmitter } from '../types.js';
import { locatorSource } from './locator.js';
import { GENERATED_HEADER, SUPPORT_IMPORT, SUPPORT_MODULE_PATH, supportModuleSource } from './support.js';

/**
 * Playwright renderer of the IR: one shared `support/tathya.ts` plus one `<stem>.spec.ts` per
 * category and route shape. Specs import their helpers from the support module, group tests in
 * `test.describe` blocks per role and page, gate the role once per group, narrate phases with
 * `test.step`, and carry tags/annotations so a run can be filtered with `--grep @negative` etc.
 * No rule lives here: every decision is already in the `TestPlan` (see `ir/build.ts`).
 */
export const playwrightEmitter: SpecEmitter = {
  files(plans, config) {
    const files = new Map<string, string>();
    files.set(SUPPORT_MODULE_PATH, supportModuleSource(config));
    for (const [stem, group] of groupBy(plans, (plan) => plan.file)) files.set(`${stem}.spec.ts`, specSource(group, config));
    return files;
  },
};

// ---------------------------------------------------------------------------------------------
// One spec file
// ---------------------------------------------------------------------------------------------

function specSource(group: TestPlan[], config: TathyaConfig): string {
  const kind = group[0].kind;
  const parts: string[] = [GENERATED_HEADER, `import { ${helperImports(kind, config).join(', ')} } from '${SUPPORT_IMPORT}';\n`];
  if (kind === 'form') parts.push(fakerPreamble(config));
  // Login tests must start logged out: the role projects pre-authenticate via storageState.
  if (kind === 'auth') parts.push(`\ntest.use({ storageState: { cookies: [], origins: [] } });\n`);

  for (const [role, rolePlans] of groupBy(group, (plan) => plan.role)) {
    parts.push(`\ntest.describe(${q(rolePlans[0].describe)}, () => {\n`);
    parts.push(`  test.skip(({ role }) => role !== ${q(role)}, ${q(`runs under the ${role} project only`)});\n`);
    if (kind === 'form') {
      for (const [formGroup, formPlans] of groupBy(rolePlans, (plan) => plan.formGroup ?? '')) {
        parts.push(`\n  test.describe(${q(formGroup)}, () => {\n`);
        for (const plan of formPlans) parts.push(indent(testSource(plan), 4), '\n');
        parts.push('  });\n');
      }
    } else {
      for (const plan of rolePlans) parts.push('\n', indent(testSource(plan), 2), '\n');
    }
    parts.push('});\n');
  }
  return parts.join('');
}

function helperImports(kind: TestPlan['kind'], config: TathyaConfig): string[] {
  const readOnlyExtra = config.mode === 'read-only' ? ['expectRouteAllowed'] : [];
  switch (kind) {
    case 'auth':
      return ['test', 'performLogin', 'assertLoggedIn', 'assertLoginRejected', 'assertLoggedOut'];
    case 'form':
      return ['test', 'expect', 'uploadFixture', 'expectQueryEcho', 'expectStateFlipped', ...readOnlyExtra];
    case 'interaction':
    case 'pagination':
      return ['test', 'expect', 'expectNoServerError', ...readOnlyExtra];
    case 'rbac':
      return ['test', 'expect', 'expectRouteAllowed', 'expectRouteBlocked', 'expectInferredRouteOpens'];
  }
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

function testSource(plan: TestPlan): string {
  const options = `{ tag: ${JSON.stringify(plan.tags)}, annotation: ${JSON.stringify(plan.annotations)} }`;
  // Only the logged-out auth scenarios run without the `app` session fixture.
  const fixtures = plan.steps.some((step) => step.kind === 'login') ? '{ page, app }' : '{ page }';
  const body = plan.steps.map((step) => indent(stepSource(step, plan), 2));
  return [`test(${q(plan.title)}, ${options}, async (${fixtures}) => {`, ...body, '});'].join('\n');
}

function stepSource(step: Step, plan: TestPlan): string {
  switch (step.kind) {
    case 'login':
      return step.mode === 'reuse'
        ? `await test.step(${q(step.title)}, () => app.ensureLoggedIn(${q(step.role)}));`
        : `await test.step(${q(step.title)}, () => app.loginAs(${q(step.role)}));`;
    case 'login-with':
      return `await test.step(${q(step.title)}, () => performLogin(page, ${q(step.username)}, ${q(step.password)}));`;
    case 'open':
      return step.capture
        ? `const ${step.capture} = await test.step(${q(step.title)}, () => page.goto(${q(step.url)}));`
        : `await test.step(${q(step.title)}, () => page.goto(${q(step.url)}));`;
    case 'declare':
      return `const ${step.name} = ${step.expr};`;
    case 'fill':
      return [`await test.step('${step.title}', async () => {`, ...step.fills.map((fill) => indent(fillSource(fill), 2)), '});'].join('\n');
    case 'capture-text':
      return `const ${step.name} = await ${scopedSubmitSource(step.submit)}.textContent().catch(() => null);`;
    case 'submit':
      return [`await test.step('${step.title}', async () => {`, indent(submitClickSource(step.submit, step.acceptDialog), 2), '});'].join('\n');
    case 'logout': {
      const scope = `page.locator(${q(step.submit.formSelector)})`;
      return `await test.step('${step.title}', async () => {
  const form = ${scope}.first();
  const submitControl = ((await form.count()) > 0 ? ${locatorSource(step.submit.locator, 'form')} : ${locatorSource(step.submit.locator)}.first());
  // Logout controls usually live in a collapsed account menu; the scenario is that the session
  // ends, not the menu animation, so submit the form directly when its control is hidden.
  if (await submitControl.isVisible().catch(() => false)) await submitControl.click();
  else if ((await form.count()) > 0) await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  else await submitControl.click({ force: true });
});`;
    }
    case 'act': {
      const action = step.action.type === 'select' ? `target.selectOption(${q(step.action.value)})` : 'target.click()';
      return [
        `const target = ${nth(locatorSource(step.target.locator), step.target.ordinal)};`,
        `test.skip(await target.count() === 0 || !(await target.isVisible().catch(() => false)), '${step.skipReason}');`,
        `await test.step(${q(step.title)}, () => ${action});`,
      ].join('\n');
    }
    case 'assert': {
      const calls = step.oracles.flatMap(oracleCalls);
      // A form's outcome (its last step) is a block of assertions, as is anything needing several
      // calls; a single check elsewhere is written as one line.
      if (calls.length !== 1 || (plan.kind === 'form' && step === plan.steps.at(-1))) {
        return [`await test.step(${q(step.title)}, async () => {`, ...calls.map((call) => `  await ${call};`), '});'].join('\n');
      }
      return `await test.step(${assertTitle(step.title, step.oracles[0])}, () => ${calls[0]});`;
    }
    default:
      return assertNever(step);
  }
}

/** Checks whose title is a fixed phrase are written as single-quoted literals. */
function assertTitle(title: string, oracle: Oracle): string {
  const fixed = oracle.type === 'no-server-error' || oracle.type === 'logged-in' || oracle.type === 'login-rejected'
    || ((oracle.type === 'route-allowed' || oracle.type === 'route-blocked' || oracle.type === 'route-inferred') && oracle.capture === 'response');
  return fixed ? `'${title}'` : q(title);
}

/**
 * Click the form's submit control, scoped to the owning form when it can be identified by its
 * action attribute. Pages with one form per table row (toggle/delete) repeat the same accessible
 * button name, so an unscoped getByRole click violates strict mode; scoping by action keeps the
 * click on the intended form. Falls back to `.first()` for forms without a usable action
 * attribute (e.g. SPA forms that submit via JS).
 */
function submitClickSource(submit: SubmitTarget, acceptDialog: boolean): string {
  const lines: string[] = [];
  // Playwright dismisses dialogs by default, which would silently cancel a destructive action.
  if (acceptDialog) lines.push(`page.once('dialog', (dialog) => { dialog.accept().catch(() => undefined); });`);
  lines.push(
    `const submitControl = ${scopedSubmitSource(submit)};`,
    // Controls hidden behind collapsed menus/dropdowns (e.g. a logout form inside a nav dropdown)
    // are skipped, not failed.
    `test.skip(!(await submitControl.isVisible().catch(() => false)), 'submit control is not visible');`,
    `await submitControl.click();`,
  );
  return lines.join('\n');
}

/** The submit control scoped to its form when the action identifies one, else the first match. */
function scopedSubmitSource(submit: SubmitTarget): string {
  const scope = `page.locator(${q(submit.formSelector)})`;
  return `((await ${scope}.count()) > 0 ? ${locatorSource(submit.locator, `${scope}.first()`)} : ${locatorSource(submit.locator)}.first())`;
}

function fillSource(fill: Fill): string {
  switch (fill.kind) {
    case 'type':
      return `await ${locatorSource(fill.target)}.fill(${valueSource(fill.value)});`;
    case 'upload':
      return `await ${locatorSource(fill.target)}.setInputFiles(uploadFixture(${q(fill.mimeType)}));`;
    case 'clear-file':
      return `await ${locatorSource(fill.target)}.setInputFiles([]);`;
    case 'check':
      return `await ${locatorSource(fill.target)}.check();`;
    case 'set-checked':
      return `await ${locatorSource(fill.target)}.setChecked(${JSON.stringify(fill.checked)});`;
    case 'select-option':
      return `await ${locatorSource(fill.target)}.selectOption(${q(fill.value)});`;
    case 'force-radio':
      return `await page.locator(${q(`input[type="radio"][name="${escapeAttrValue(fill.name)}"]`)}).first().evaluate((element, value) => {
  if (element instanceof HTMLInputElement) {
    element.value = value;
    element.checked = true;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(fill.value)});`;
    case 'uncheck-radios':
      return `await page.locator(${q(`[name="${escapeAttrValue(fill.name)}"]`)}).evaluateAll((elements) => {
  for (const element of elements) {
    if (element instanceof HTMLInputElement && element.type === 'radio') {
      element.checked = false;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});`;
    case 'force-option':
      return `await ${locatorSource(fill.target)}.evaluate((element, value) => {
  if (element instanceof HTMLSelectElement) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    element.appendChild(option);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(fill.value)});`;
    case 'clear-select':
      return `await ${locatorSource(fill.target)}.evaluate((element) => {
  if (element instanceof HTMLSelectElement) {
    element.selectedIndex = -1;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
});`;
    case 'force-value':
      return `await ${locatorSource(fill.target)}.evaluate((element, value) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(fill.value)});`;
    default:
      return assertNever(fill);
  }
}

/** The awaitable expressions that make up one oracle, one per assertion call site. */
function oracleCalls(oracle: Oracle): string[] {
  switch (oracle.type) {
    case 'server-error':
      return [
        `expect(page.locator(${q(oracle.errorSelector)}).first()).toBeVisible()`,
        `expect(page).toHaveURL(new RegExp(${q(oracle.urlPattern)}))`,
      ];
    case 'native-invalid':
      return [`expect(${locatorSource(oracle.target)}).toHaveJSProperty('validity.valid', false)`];
    case 'body-graceful':
      return [`expect(page.locator('body')).not.toContainText(/500|server error|exception/i)`];
    case 'record-gone':
      return [`expect(page.locator(${q(oracle.formSelector)})).toHaveCount(0)`];
    case 'state-flipped':
      return [`expectStateFlipped(page, ${q(oracle.formSelector)}, before)`];
    case 'query-echo':
      return [`expectQueryEcho(page, { ${oracle.params.map((param) => `${q(param.name)}: ${valueSource(param.value)}`).join(', ')} })`];
    case 'text-visible':
      return [`expect(page.getByText(${valueSource(oracle.value)}).first()).toBeVisible()`];
    case 'landed':
      return [oracle.withSearch
        ? `expect(page).toHaveURL((url) => url.pathname + url.search === ${q(oracle.path)})`
        : `expect(page).toHaveURL((url) => url.pathname === ${q(oracle.path)})`];
    case 'no-server-error':
      return ['expectNoServerError(page)'];
    case 'route-allowed':
      return [`expectRouteAllowed(page, ${oracle.capture}, ${q(oracle.path)})`];
    case 'route-blocked':
      return [`expectRouteBlocked(page, ${oracle.capture}, ${q(oracle.path)})`];
    case 'route-inferred':
      return [`expectInferredRouteOpens(page, ${oracle.capture}, ${q(oracle.path)})`];
    case 'absent':
      return [`expect(${locatorSource(oracle.target)}).toHaveCount(0)`];
    case 'logged-in':
      return ['assertLoggedIn(page)'];
    case 'login-rejected':
      return ['assertLoginRejected(page)'];
    case 'logged-out':
      return [`assertLoggedOut(page, ${q(oracle.path)})`];
    default:
      return assertNever(oracle);
  }
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function valueSource(value: ValueRef): string {
  return value.kind === 'var' ? value.name : q(value.value);
}

function q(value: string): string {
  return JSON.stringify(value);
}

function nth(locator: string, ordinal: number): string {
  return ordinal === 0 ? `${locator}.first()` : `${locator}.nth(${ordinal})`;
}

function indent(source: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return source.split('\n').map((line) => (line.length > 0 ? pad + line : line)).join('\n');
}
