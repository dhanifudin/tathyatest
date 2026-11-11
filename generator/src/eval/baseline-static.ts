/**
 * Static analysis of a baseline suite's spec sources.
 *
 * The per-file counting is framework-specific and lives in the adapter's runner
 * (`TestRunner.staticAnalysis`); this module only aggregates a directory tree. Results are used as
 * source-level proxies for test count, assertion density, and locator-strategy mix — documented as
 * such in the evaluation report (not executed-line coverage).
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SpecAnalysis, TestRunner } from '../adapters/types.js';

export type { SpecAnalysis } from '../adapters/types.js';
export type LocatorCounts = Record<string, number>;

export type BaselineStaticAnalysis = {
  /** Total spec files analysed. */
  specFiles: number;
  /** Aggregate counts across all files. */
  totals: SpecAnalysis;
  /** Derived metrics. */
  assertionDensity: number;
  brittleLocatorRatio: number;
  locatorDistribution: LocatorCounts;
  testCount: number;
};

/**
 * Scan a directory for the framework's spec files (recursively) and return the aggregate static
 * analysis. Returns null if the directory does not exist or contains no spec files.
 */
export async function analyzeBaselineDir(dir: string, runner: Pick<TestRunner, 'specFile' | 'staticAnalysis'>): Promise<BaselineStaticAnalysis | null> {
  try {
    await access(dir);
  } catch {
    return null;
  }

  const files = await collectSpecFiles(dir, runner.specFile);
  if (files.length === 0) return null;

  const totals: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: {} };

  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const analysis = runner.staticAnalysis(src);
    totals.tests += analysis.tests;
    totals.assertions += analysis.assertions;
    for (const [strategy, count] of Object.entries(analysis.locatorCounts)) {
      totals.locatorCounts[strategy] = (totals.locatorCounts[strategy] ?? 0) + count;
    }
  }

  const totalLocators = Object.values(totals.locatorCounts).reduce((sum, n) => sum + n, 0);
  const brittleCount = totals.locatorCounts.css ?? 0;

  return {
    specFiles: files.length,
    totals,
    testCount: totals.tests,
    assertionDensity: totals.tests === 0 ? 0 : totals.assertions / totals.tests,
    brittleLocatorRatio: totalLocators === 0 ? 0 : brittleCount / totalLocators,
    locatorDistribution: { ...totals.locatorCounts },
  };
}

/** Whether `dir` holds at least one spec file of the framework (manual baseline detection). */
export async function hasSpecs(dir: string, specFile: RegExp): Promise<boolean> {
  try {
    return (await collectSpecFiles(dir, specFile)).length > 0;
  } catch {
    return false;
  }
}

async function collectSpecFiles(dir: string, specFile: RegExp): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!specFile.test(entry.name)) continue;
    // entry.parentPath (Node ≥20.12) or the deprecated entry.path gives the containing dir.
    const dir2: string = ('parentPath' in entry ? entry.parentPath : (entry as { path: string }).path) as string;
    results.push(join(dir2, entry.name));
  }
  return results.sort();
}
