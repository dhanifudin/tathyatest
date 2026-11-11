import type { TathyaConfig } from '../../config.js';
import type { Locator } from '../../crawl/model.js';
import { groupBy } from '../../ir/layout.js';
import { assertNever, type Fill, type Oracle, type Step, type TestPlan, type ValueRef } from '../../ir/types.js';
import { GENERATED_HEADER, type SpecEmitter } from '../types.js';
import { SUPPORT_E2E_PATH, SUPPORT_IMPORT, SUPPORT_MODULE_PATH, supportE2eSource, supportModuleSource } from './support.js';

/**
 * Cypress renderer of the IR: `support/tathya.ts` (helpers), `support/e2e.ts` (supportFile), and one
 * `<stem>.cy.ts` per category and route shape — the same files, groups, titles, tags, and step
 * titles as the Playwright adapter. Cypress queues commands instead of awaiting them, so values that
 * cross steps travel as aliases (`@response`, `@before`), and tests are `function () {}` callbacks so
 * `this.skip()` is available. No rule lives here: every decision is already in the `TestPlan`.
 */
export const cypressEmitter: SpecEmitter = {
  files(plans, config) {
    const files = new Map<string, string>();
    files.set(SUPPORT_MODULE_PATH, supportModuleSource(config));
    files.set(SUPPORT_E2E_PATH, supportE2eSource());
    for (const [stem, group] of groupBy(plans, (plan) => plan.file)) files.set(`${stem}.cy.ts`, specSource(group, config));
    return files;
  },
};

/** Helpers a spec may import from the support module, in import order. */
const HELPERS = [
  'currentRole', 'step', 'byTestId', 'byRole', 'byLabel', 'byPlaceholder', 'byId', 'byName', 'byCss', 'nth', 'skipUnlessVisible',
  'loginAs', 'ensureLoggedIn', 'performLogin', 'openPage', 'submitLogout', 'submitForm', 'captureSubmitText',
  'fillIn', 'forceValue', 'forceOption', 'clearSelect', 'uncheckRadios', 'clearFile', 'uploadFixture',
  'assertLoggedIn', 'assertLoginRejected', 'assertLoggedOut', 'expectServerError', 'expectInvalid', 'expectGraceful',
  'expectGone', 'expectAbsent', 'expectTextVisible', 'expectLanded', 'expectQueryEcho', 'expectStateFlipped',
  'expectNoServerError', 'expectRouteAllowed', 'expectInferredRouteOpens', 'expectRouteBlocked',
];

// ---------------------------------------------------------------------------------------------
// One spec file
// ---------------------------------------------------------------------------------------------

function specSource(group: TestPlan[], config: TathyaConfig): string {
  const kind = group[0].kind;
  const body: string[] = [];
  for (const [role, rolePlans] of groupBy(group, (plan) => plan.role)) {
    body.push(`\ndescribe(${q(rolePlans[0].describe)}, function () {\n`);
    // Each run serves one role (`--expose role=<name>`); the other roles' groups report as skipped.
    body.push(`  before(function () { if (currentRole() !== ${q(role)}) this.skip(); });\n`);
    if (kind === 'form') {
      for (const [formGroup, formPlans] of groupBy(rolePlans, (plan) => plan.formGroup ?? '')) {
        body.push(`\n  describe(${q(formGroup)}, function () {\n`);
        for (const plan of formPlans) body.push(indent(testSource(plan), 4), '\n');
        body.push('  });\n');
      }
    } else {
      for (const plan of rolePlans) body.push('\n', indent(testSource(plan), 2), '\n');
    }
    body.push('});\n');
  }
  const source = body.join('');
  const helpers = HELPERS.filter((name) => new RegExp(`\\b${name}\\(`).test(source));
  const header = [GENERATED_HEADER, `import { ${helpers.join(', ')} } from '${SUPPORT_IMPORT}';\n`];
  if (kind === 'form') header.push(fakerPreamble(config));
  return header.join('') + source;
}

function fakerPreamble(config: TathyaConfig): string {
  const { locale, seed } = config.data.faker;
  const importLine = locale && locale !== 'en'
    ? `import { allFakers } from '@faker-js/faker';\nconst faker = allFakers[${JSON.stringify(locale)}] ?? allFakers['en'];\n`
    : `import { faker } from '@faker-js/faker';\n`;
  const seedLine = seed !== null && seed !== undefined ? `before(() => { faker.seed(${seed}); });\n` : '';
  return `${importLine}${seedLine}`;
}

// ---------------------------------------------------------------------------------------------
// One test
// ---------------------------------------------------------------------------------------------

function testSource(plan: TestPlan): string {
  const annotations = plan.annotations.map((annotation) => `${annotation.type}: ${annotation.description}`).join(' · ');
  return [
    `it(${q(plan.title)}, { tags: ${JSON.stringify(plan.tags)} }, function () {`,
    `  // ${annotations}`,
    ...plan.steps.map((step) => indent(stepSource(step), 2)),
    '});',
  ].join('\n');
}

function stepSource(step: Step): string {
  switch (step.kind) {
    case 'login':
      return `step(${q(step.title)}, () => ${step.mode === 'reuse' ? 'ensureLoggedIn' : 'loginAs'}(${q(step.role)}));`;
    case 'login-with':
      return `step(${q(step.title)}, () => performLogin(${q(step.username)}, ${q(step.password)}));`;
    case 'open':
      return `step(${q(step.title)}, () => openPage(${q(step.url)}${step.capture ? `, ${q(step.capture)}` : ''}));`;
    case 'declare':
      return `const ${step.name} = ${step.expr};`;
    case 'fill':
      return block(step.title, step.fills.map(fillSource));
    case 'capture-text':
      return `captureSubmitText(${q(step.submit.formSelector)}, ${locatorSource(step.submit.locator)}, ${q(step.name)});`;
    case 'submit':
      return block(step.title, [
        // Cypress accepts confirm() by default; stated for the reader of a destructive test.
        ...(step.acceptDialog ? ['cy.on(\'window:confirm\', () => true);'] : []),
        `submitForm(this, ${q(step.submit.formSelector)}, ${locatorSource(step.submit.locator)});`,
      ]);
    case 'logout':
      return `step(${q(step.title)}, () => submitLogout(${q(step.submit.formSelector)}, ${locatorSource(step.submit.locator)}));`;
    case 'act': {
      const target = `nth(${locatorSource(step.target.locator)}, ${step.target.ordinal})`;
      const action = step.action.type === 'select' ? `select(${q(step.action.value)})` : 'click()';
      return [
        `skipUnlessVisible(this, ${locatorSource(step.target.locator)}, ${step.target.ordinal}, ${q(step.skipReason)});`,
        `step(${q(step.title)}, () => ${target}.${action});`,
      ].join('\n');
    }
    case 'assert':
      return step.oracles.length === 1
        ? `step(${q(step.title)}, () => ${oracleSource(step.oracles[0]).replace(/;$/, '')});`
        : block(step.title, step.oracles.map(oracleSource));
    default:
      return assertNever(step);
  }
}

function block(title: string, lines: string[]): string {
  return [`step(${q(title)}, () => {`, ...lines.map((line) => indent(line, 2)), '});'].join('\n');
}

function fillSource(fill: Fill): string {
  switch (fill.kind) {
    case 'type':
      return `fillIn(${locatorSource(fill.target)}, ${valueSource(fill.value)});`;
    case 'upload':
      return `cy.tt(${locatorSource(fill.target)}).selectFile(uploadFixture(${q(fill.mimeType)}));`;
    case 'clear-file':
      return `clearFile(${locatorSource(fill.target)});`;
    case 'check':
      return `cy.tt(${locatorSource(fill.target)}).check();`;
    case 'set-checked':
      return `cy.tt(${locatorSource(fill.target)}).${fill.checked ? 'check' : 'uncheck'}();`;
    case 'select-option':
      return `cy.tt(${locatorSource(fill.target)}).select(${q(fill.value)});`;
    case 'uncheck-radios':
      return `uncheckRadios(${q(fill.name)});`;
    case 'force-option':
      return `forceOption(${locatorSource(fill.target)}, ${q(fill.value)});`;
    case 'clear-select':
      return `clearSelect(${locatorSource(fill.target)});`;
    case 'force-value':
      return `forceValue(${locatorSource(fill.target)}, ${q(fill.value)});`;
    default:
      return assertNever(fill);
  }
}

function oracleSource(oracle: Oracle): string {
  switch (oracle.type) {
    case 'server-error':
      return `expectServerError(${q(oracle.errorSelector)}, ${q(oracle.urlPattern)});`;
    case 'native-invalid':
      return `expectInvalid(${locatorSource(oracle.target)});`;
    case 'body-graceful':
      return 'expectGraceful();';
    case 'record-gone':
      return `expectGone(${q(oracle.formSelector)});`;
    case 'state-flipped':
      return `expectStateFlipped(${q(oracle.formSelector)}, '@before');`;
    case 'query-echo':
      return `expectQueryEcho({ ${oracle.params.map((param) => `${q(param.name)}: ${valueSource(param.value)}`).join(', ')} });`;
    case 'text-visible':
      return `expectTextVisible(${valueSource(oracle.value)});`;
    case 'landed':
      return `expectLanded(${q(oracle.path)}, ${oracle.withSearch});`;
    case 'no-server-error':
      return 'expectNoServerError();';
    case 'route-allowed':
      return `expectRouteAllowed('@${oracle.capture}', ${q(oracle.path)});`;
    case 'route-blocked':
      return `expectRouteBlocked('@${oracle.capture}', ${q(oracle.path)});`;
    case 'route-inferred':
      return `expectInferredRouteOpens(this, '@${oracle.capture}', ${q(oracle.path)});`;
    case 'absent':
      return `expectAbsent(${locatorSource(oracle.target)});`;
    case 'logged-in':
      return 'assertLoggedIn();';
    case 'login-rejected':
      return 'assertLoginRejected();';
    case 'logged-out':
      return `assertLoggedOut(${q(oracle.path)});`;
    default:
      return assertNever(oracle);
  }
}

/** The locator priority chain as a support-module builder (`byRole("button", "Save")`). */
export function locatorSource(locator: Locator): string {
  switch (locator.strategy) {
    case 'testid':
      return `byTestId(${q(locator.value)})`;
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      return name ? `byRole(${q(role)}, ${q(name)})` : `byRole(${q(role)})`;
    }
    case 'label':
      return `byLabel(${q(locator.value)})`;
    case 'placeholder':
      return `byPlaceholder(${q(locator.value)})`;
    case 'id':
      return `byId(${q(locator.value)})`;
    case 'name':
      return `byName(${q(locator.value)})`;
    case 'css':
      return `byCss(${q(locator.value)})`;
  }
}

function valueSource(value: ValueRef): string {
  return value.kind === 'var' ? value.name : q(value.value);
}

function q(value: string): string {
  return JSON.stringify(value);
}

function indent(source: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return source.split('\n').map((line) => (line.length > 0 ? pad + line : line)).join('\n');
}
