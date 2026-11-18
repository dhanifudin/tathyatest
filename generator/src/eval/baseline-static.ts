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
 *
 * Every `.ts`/`.js` file under the directory is analysed (page objects and fixtures included), except
 * `node_modules`, `.git`, build output, and an optional ignore pattern. Assertions inside a page
 * object are counted once where they are defined, so reuse is not credited: a conservative bias
 * for suites built on page objects, stated in the evaluation report.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

export type LocatorCounts = Record<string, number>;

export type SpecAnalysis = {
  /** Number of test()/it() definitions found. */
  tests: number;
  /** Number of assertions (expect calls and expect-prefixed or assert-prefixed helper calls). */
  assertions: number;
  /** Per-strategy locator counts (testid/role/label/placeholder/id/name/css). */
  locatorCounts: LocatorCounts;
};

export type BaselineStaticAnalysis = {
  /** Files that define at least one test. */
  specFiles: number;
  /** All source files analysed (specs, page objects, fixtures). */
  sourceFiles: number;
  /** Aggregate counts across all files. */
  totals: SpecAnalysis;
  /** Derived metrics. */
  assertionDensity: number;
  brittleLocatorRatio: number;
  locatorDistribution: LocatorCounts;
  testCount: number;
};

export type AnalyzeDirOptions = {
  /** Source files whose path matches are skipped (for example the generated suite's shared helper module). */
  ignorePath?: RegExp;
};

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

function emptyCounts(): LocatorCounts {
  return { testid: 0, role: 0, label: 0, placeholder: 0, id: 0, name: 0, css: 0 };
}

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
  const result: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: emptyCounts() };

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

/** Combine per-file analyses into the report shape. */
export function summarizeAnalyses(perFile: SpecAnalysis[]): BaselineStaticAnalysis {
  const totals: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: emptyCounts() };
  let specFiles = 0;
  for (const analysis of perFile) {
    totals.tests += analysis.tests;
    totals.assertions += analysis.assertions;
    if (analysis.tests > 0) specFiles += 1;
    for (const [strategy, count] of Object.entries(analysis.locatorCounts)) {
      totals.locatorCounts[strategy] = (totals.locatorCounts[strategy] ?? 0) + count;
    }
  }
  const totalLocators = Object.values(totals.locatorCounts).reduce((sum, n) => sum + n, 0);
  return {
    specFiles,
    sourceFiles: perFile.length,
    totals,
    testCount: totals.tests,
    assertionDensity: totals.tests === 0 ? 0 : totals.assertions / totals.tests,
    brittleLocatorRatio: totalLocators === 0 ? 0 : (totals.locatorCounts.css ?? 0) / totalLocators,
    locatorDistribution: { ...totals.locatorCounts },
  };
}

/**
 * Analyse every `.ts`/`.js` source under `dir` (skipping dependencies and build output). Returns null
 * when the directory is missing or defines no tests.
 */
export async function analyzeBaselineDir(dir: string, options: AnalyzeDirOptions = {}): Promise<BaselineStaticAnalysis | null> {
  try {
    await access(dir);
  } catch {
    return null;
  }
  const files = await collectSourceFiles(dir, options.ignorePath);
  const analyses: SpecAnalysis[] = [];
  for (const file of files) analyses.push(analyzeSpecSource(await readFile(file, 'utf8')));
  const summary = summarizeAnalyses(analyses);
  return summary.testCount === 0 ? null : summary;
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'playwright-report', 'test-results', 'coverage']);

async function collectSourceFiles(dir: string, ignorePath?: RegExp): Promise<string[]> {
  const results: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) await walk(full);
      } else if (/\.(ts|js|mts|mjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) && !ignorePath?.test(full)) {
        results.push(full);
      }
    }
  };
  await walk(dir);
  return results.sort();
}
