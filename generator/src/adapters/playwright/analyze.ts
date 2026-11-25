/**
 * Static analysis of Playwright test sources, used as ONE instrument for both sides of the
 * generated-versus-baseline comparison (the generated suite is analysed with the same code).
 *
 * The analysis parses TypeScript/JavaScript with the TypeScript compiler API and counts syntax,
 * not executed lines:
 *   - tests: `test(...)` / `it(...)` calls with a string title (also `.only`, `.skip`, `.fixme`);
 *   - assertions: `expect(...)` / `expect.soft(...)` / `expect.poll(...)`, `assert(...)` /
 *     `assert.x(...)`, and calls to helpers named `expect*` / `assert*` (a helper is one assertion at
 *     its call site);
 *   - locators: Playwright semantic APIs (`getByTestId`, `getByRole`, ...), `locator('<selector>')`,
 *     and string selectors passed to page methods (`page.click('<selector>')`, `page.fill('<selector>', v)`),
 *     each classified by selector text.
 */
import ts from 'typescript';
import { emptyLocatorCounts, type LocatorCounts, type SpecAnalysis } from '../types.js';

const SEMANTIC_LOCATOR_APIS: ReadonlyMap<string, string> = new Map(Object.entries({
  getByTestId: 'testid',
  getByRole: 'role',
  getByLabel: 'label',
  getByPlaceholder: 'placeholder',
  // User-facing text locators sit with label in the priority chain: they are not structural selectors.
  getByText: 'label',
  getByAltText: 'label',
  getByTitle: 'label',
}));

/** Page methods whose first argument is a selector string (a Locator never takes a string there). */
const SELECTOR_FIRST_METHODS = new Set([
  'click', 'dblclick', 'hover', 'focus', 'check', 'uncheck', 'textContent', 'innerText', 'innerHTML',
  'isVisible', 'isHidden', 'isChecked', 'isDisabled', 'isEnabled', 'waitForSelector', 'dispatchEvent', '$', '$$',
]);

/** Methods that take (selector, value) on a page but (value, options) on a Locator. */
const SELECTOR_VALUE_METHODS = new Set(['fill', 'type', 'selectOption', 'press', 'setInputFiles']);

const TEST_TITLE_CALLEES = new Set(['test', 'it']);
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail']);

/** Classify a selector string into a strategy of the locator priority chain. */
export function classifySelector(selector: string): string {
  const s = selector.trim();
  if (/^\[data-test(id)?=["'][^"']+["']\]$/.test(s)) return 'testid';
  if (/^#[\w-]+$/.test(s)) return 'id';
  if (/^[a-z]*\[name=["'][^"']+["']\]$/i.test(s)) return 'name';
  return 'css';
}

function isStringLike(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isTestDefinition(call: ts.CallExpression): boolean {
  const callee = call.expression;
  let base: string | null = null;
  if (ts.isIdentifier(callee)) base = callee.text;
  else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && TEST_MODIFIERS.has(callee.name.text)) {
    base = callee.expression.text;
  }
  if (base === null || !TEST_TITLE_CALLEES.has(base)) return false;
  // `test.skip(cond, 'reason')` inside a body is not a definition: a definition has a string title first.
  const [title, body] = call.arguments;
  const isTitle = isStringLike(title) || (title !== undefined && ts.isTemplateExpression(title));
  return isTitle && body !== undefined;
}

function isAssertion(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text === 'expect' || callee.text === 'assert' || /^(expect|assert)[A-Z_]/.test(callee.text);
  }
  if (ts.isPropertyAccessExpression(callee)) {
    const owner = ts.isIdentifier(callee.expression) ? callee.expression.text : null;
    if (owner === 'expect' || owner === 'assert') return true;
    // Helper method on a page object or fixture: `app.expectLoggedIn()`, `page.assertTitle()`.
    return /^(expect|assert)[A-Z_]/.test(callee.name.text);
  }
  return false;
}

function addLocator(counts: LocatorCounts, strategy: string): void {
  counts[strategy] = (counts[strategy] ?? 0) + 1;
}

/** Analyse one source text (TypeScript or JavaScript). */
export function analyzeSpecSource(src: string): SpecAnalysis {
  const file = ts.createSourceFile('input.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: emptyLocatorCounts() };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (isTestDefinition(node)) result.tests += 1;
      else if (isAssertion(node)) result.assertions += 1;

      const name = calleeName(node.expression);
      if (name !== null) {
        const semantic = SEMANTIC_LOCATOR_APIS.get(name);
        if (semantic !== undefined) addLocator(result.locatorCounts, semantic);
        else if (name === 'locator' && isStringLike(node.arguments[0])) {
          addLocator(result.locatorCounts, classifySelector(node.arguments[0].text));
        } else if (SELECTOR_FIRST_METHODS.has(name) && isStringLike(node.arguments[0]) && ts.isPropertyAccessExpression(node.expression)) {
          addLocator(result.locatorCounts, classifySelector(node.arguments[0].text));
        } else if (
          SELECTOR_VALUE_METHODS.has(name)
          && ts.isPropertyAccessExpression(node.expression)
          && node.arguments.length >= 2
          && isStringLike(node.arguments[0])
          && node.arguments[1] !== undefined
          && !ts.isObjectLiteralExpression(node.arguments[1])
        ) {
          addLocator(result.locatorCounts, classifySelector(node.arguments[0].text));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}
