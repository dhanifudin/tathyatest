/**
 * Static analysis of a suite's sources, applied to the manual baseline and to the generated suite.
 *
 * The per-file counting is framework-specific and lives in the adapter's runner
 * (`TestRunner.staticAnalysis`); this module only walks and aggregates a directory tree. Every
 * `.ts`/`.js` file is analysed (page objects and fixtures included), except `node_modules`, `.git`,
 * build output, the other framework's specs, and an optional ignore pattern. Assertions inside a page
 * object are counted once where they are defined, so reuse is not credited: a conservative bias
 * for suites built on page objects, stated in the evaluation report. The results are source-level
 * proxies for test count, assertion density, and locator-strategy mix, not executed coverage.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyLocatorCounts, type LocatorCounts, type SpecAnalysis, type TestRunner } from '../adapters/types.js';

export type { LocatorCounts, SpecAnalysis } from '../adapters/types.js';

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

/** Combine per-file analyses into the report shape. */
export function summarizeAnalyses(perFile: SpecAnalysis[]): BaselineStaticAnalysis {
  const totals: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: emptyLocatorCounts() };
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
 * Analyse every source under `dir` with the framework's analyser. Returns null when the directory is
 * missing or defines no tests.
 */
export async function analyzeBaselineDir(
  dir: string,
  runner: Pick<TestRunner, 'foreignSpecFile' | 'staticAnalysis'>,
  options: AnalyzeDirOptions = {},
): Promise<BaselineStaticAnalysis | null> {
  try {
    await access(dir);
  } catch {
    return null;
  }
  const files = (await collectSourceFiles(dir))
    .filter((file) => !runner.foreignSpecFile.test(file) && !options.ignorePath?.test(file));
  const analyses: SpecAnalysis[] = [];
  for (const file of files) analyses.push(runner.staticAnalysis(await readFile(file, 'utf8')));
  const summary = summarizeAnalyses(analyses);
  return summary.testCount === 0 ? null : summary;
}

/** Whether `dir` holds at least one spec file of the framework (manual baseline detection). */
export async function hasSpecs(dir: string, specFile: RegExp): Promise<boolean> {
  try {
    return (await collectSourceFiles(dir)).some((file) => specFile.test(file));
  } catch {
    return false;
  }
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'playwright-report', 'test-results', 'coverage']);

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) await walk(full);
      } else if (/\.(ts|js|mts|mjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        results.push(full);
      }
    }
  };
  await walk(dir);
  return results.sort();
}
