import type { TathyaConfig } from '../../config.js';
import type { Locator } from '../../crawl/model.js';
import { groupBy } from '../../ir/layout.js';
import { escapeAttrValue } from '../../util/escape.js';
import { assertNever, type Fill, type Oracle, type Step, type TestPlan, type ValueRef } from '../../ir/types.js';
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
  const seeded = config.data.faker.seed !== null && config.data.faker.seed !== undefined ? ['seedOffset'] : [];
  switch (kind) {
    case 'auth':
      return ['test', 'performLogin', 'submitLogout', 'assertLoggedIn', 'assertLoginRejected', 'assertLoggedOut'];
    case 'form':
      return ['test', 'expect', 'formOf', 'requireControl', 'uploadFixture', 'expectQueryEcho', 'expectStateFlipped', 'expectNoServerError', 'expectNoValidationError', 'expectValuePersisted', ...seeded, ...readOnlyExtra];
    case 'interaction':
    case 'pagination':
      return ['test', 'expect', 'requireControl', 'expectNoServerError', ...readOnlyExtra];
    case 'rbac':
      return ['test', 'expect', 'expectRouteAllowed', 'expectRouteBlocked', 'expectInferredRouteOpens'];
  }
}

function fakerPreamble(config: TathyaConfig): string {
  const { locale, seed } = config.data.faker;
  const importLine = locale && locale !== 'en'
    ? `import { allFakers } from '@faker-js/faker';\nconst faker = allFakers[${JSON.stringify(locale)}] ?? allFakers['en'];\n`
    : `import { faker } from '@faker-js/faker';\n`;
  // Seeded per project: repeatable, but two browsers sharing one app do not submit the same values.
  const seedLine = seed !== null && seed !== undefined ? `test.beforeAll(({}, testInfo) => { faker.seed(${seed} + seedOffset(testInfo.project.name)); });\n` : '';
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

/** The emitted variable holding the form under test (`formOf`). */
const FORM = 'crawledForm';

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
    case 'scope-form': {
      const { formSelector, actionShape, locator } = step.submit;
      const parameters = locator.strategy === 'role' ? '(form, includeHidden)' : '(form)';
      return `const ${FORM} = await formOf(page, ${q(formSelector)}, ${JSON.stringify(actionShape)}, ${parameters} => ${locatorSource(locator, 'form', 'includeHidden')});`;
    }
    case 'declare':
      return `const ${step.name} = ${step.expr};`;
    case 'fill':
      return [`await test.step('${step.title}', async () => {`, ...step.fills.map((fill) => indent(fillSource(fill), 2)), '});'].join('\n');
    case 'capture-text':
      return `const ${step.name} = await ${FORM}.submit(false).textContent().catch(() => null);`;
    case 'submit':
      return [`await test.step('${step.title}', async () => {`, indent(submitClickSource(step.acceptDialog), 2), '});'].join('\n');
    case 'logout':
      return `await test.step(${q(step.title)}, () => submitLogout(page, ${q(step.submit.formSelector)}, (form) => ${locatorSource(step.submit.locator, 'form')}));`;
    case 'act': {
      const action = step.action.type === 'select' ? `target.selectOption(${q(step.action.value)})` : 'target.click()';
      const parameters = step.target.locator.strategy === 'role' ? '(includeHidden)' : '()';
      return [
        `const target = await requireControl(${parameters} => ${nth(locatorSource(step.target.locator, 'page', 'includeHidden'), step.target.ordinal)}, '${step.skipReason}');`,
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

/** Click the form's submit control. */
function submitClickSource(acceptDialog: boolean): string {
  const lines: string[] = [];
  // Playwright dismisses dialogs by default, which would silently cancel a destructive action.
  if (acceptDialog) lines.push(`page.once('dialog', (dialog) => { dialog.accept().catch(() => undefined); });`);
  lines.push(
    // Controls hidden behind collapsed menus/dropdowns are skipped; missing ones fail.
    `const submitControl = await requireControl(${FORM}.submit, 'submit control is not visible');`,
    `await submitControl.click();`,
  );
  return lines.join('\n');
}

function fillSource(fill: Fill): string {
  const within = (locator: Locator) => locatorSource(locator, `${FORM}.form`);
  const group = (selector: string) => `${FORM}.form.locator(${q(selector)})`;
  switch (fill.kind) {
    case 'type':
      return `await ${within(fill.target)}.fill(${valueSource(fill.value)});`;
    case 'upload':
      return `await ${within(fill.target)}.setInputFiles(uploadFixture(${q(fill.mimeType)}));`;
    case 'clear-file':
      return `await ${within(fill.target)}.setInputFiles([]);`;
    case 'check':
      return `await ${within(fill.target)}.check();`;
    case 'set-checked':
      return `await ${within(fill.target)}.setChecked(${JSON.stringify(fill.checked)});`;
    case 'select-option':
      return `await ${within(fill.target)}.selectOption(${q(fill.value)});`;
    case 'force-radio':
      return `await ${group(`input[type="radio"][name="${escapeAttrValue(fill.name)}"]`)}.first().evaluate((element, value) => {
  if (element instanceof HTMLInputElement) {
    element.value = value;
    element.checked = true;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, ${q(fill.value)});`;
    case 'uncheck-radios':
      return `await ${group(`[name="${escapeAttrValue(fill.name)}"]`)}.evaluateAll((elements) => {
  for (const element of elements) {
    if (element instanceof HTMLInputElement && element.type === 'radio') {
      element.checked = false;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});`;
    case 'force-option':
      return `await ${within(fill.target)}.evaluate((element, value) => {
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
      return `await ${within(fill.target)}.evaluate((element) => {
  if (element instanceof HTMLSelectElement) {
    element.selectedIndex = -1;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
});`;
    case 'force-value':
      return `await ${within(fill.target)}.evaluate((element, value) => {
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
      // Only form outcomes use it, so the field is looked up in the form under test.
      return [`expect(${locatorSource(oracle.target, `${FORM}.form`)}).toHaveJSProperty('validity.valid', false)`];
    case 'body-graceful':
      return ['expectNoServerError(page)'];
    case 'record-gone':
      return [`expect(page.locator(${FORM}.selector)).toHaveCount(0)`];
    case 'state-flipped':
      return [`expectStateFlipped(page, ${FORM}.selector, before)`];
    case 'query-echo':
      return [`expectQueryEcho(page, { ${oracle.params.map((param) => `${q(param.name)}: ${valueSource(param.value)}`).join(', ')} }, ${q(oracle.path)})`];
    case 'value-persisted':
      return [`expectValuePersisted(page, ${q(oracle.url)}, ${locatorSource(oracle.target, `page.locator(${FORM}.selector)`)}, ${valueSource(oracle.value)})`];
    case 'no-validation-error':
      return ['expectNoValidationError(page)'];
    case 'landed-shape':
      return [`expect(page).toHaveURL((url) => new RegExp(${q(oracle.pattern)}).test(url.pathname))`];
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
