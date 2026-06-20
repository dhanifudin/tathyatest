/**
 * Static analysis of Playwright spec sources.
 *
 * All computations are pure (no I/O) except `analyzeBaselineDir`, which reads
 * *.spec.(t|j)s files from a directory tree. Results are used as source-level proxies
 * for test count, assertion density, and locator-strategy mix — documented as such in
 * the evaluation report (not executed-line coverage).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { access } from 'node:fs/promises';

export type LocatorCounts = Record<string, number>;

export type SpecAnalysis = {
  /** Number of top-level test() / it() calls found in the source. */
  tests: number;
  /** Number of expect() / assertion calls found in the source. */
  assertions: number;
  /** Per-strategy locator call counts (testid/role/label/placeholder/id/name/css). */
  locatorCounts: LocatorCounts;
};

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

// ---------------------------------------------------------------------------
// Pure: analyse one spec source string
// ---------------------------------------------------------------------------

/**
 * Analyse a single Playwright spec source file and return counts.
 *
 * This is a source-level regex proxy — it counts syntactic occurrences, not
 * executed lines. Documented as such in the paper.
 */
export function analyzeSpecSource(src: string): SpecAnalysis {
  // Test blocks: test( / it( / test.only( / test.skip( etc.
  const tests = countPattern(src, /\btest\s*\(/g) + countPattern(src, /\bit\s*\(/g);
  // Assertion calls: expect( / .toBe / .toEqual / .toHaveText / toBeVisible etc.
  const assertions = countPattern(src, /\bexpect\s*\(/g)
    + countPattern(src, /\.assert\s*\(/g)
    + countPattern(src, /\bassert\b/g);

  const locatorCounts: LocatorCounts = {
    testid: 0,
    role: 0,
    label: 0,
    placeholder: 0,
    id: 0,
    name: 0,
    css: 0,
  };

  // Playwright semantic locator APIs
  locatorCounts.testid += countPattern(src, /\bgetByTestId\s*\(/g);
  locatorCounts.testid += countPattern(src, /\[data-testid=/g);
  locatorCounts.testid += countPattern(src, /\[data-test=/g);
  locatorCounts.role += countPattern(src, /\bgetByRole\s*\(/g);
  locatorCounts.label += countPattern(src, /\bgetByLabel\s*\(/g);
  locatorCounts.placeholder += countPattern(src, /\bgetByPlaceholder\s*\(/g);
  locatorCounts.id += countPattern(src, /\bgetById\s*\(/g);
  locatorCounts.id += countPattern(src, /locator\s*\(\s*['"`]#[^'"`]/g);
  locatorCounts.id += countPattern(src, /page\.locator\s*\(\s*['"`]#[^'"`]/g);
  locatorCounts.name += countPattern(src, /\[name=/g);
  // Remaining locator() calls that are likely CSS selectors
  const totalLocatorCalls = countPattern(src, /\blocator\s*\(/g);
  const namedLocators = locatorCounts.testid + locatorCounts.role + locatorCounts.label
    + locatorCounts.placeholder + locatorCounts.id + locatorCounts.name;
  // Any locator() call not accounted for by semantic APIs is counted as CSS
  locatorCounts.css += Math.max(0, totalLocatorCalls - namedLocators);

  return { tests, assertions, locatorCounts };
}

function countPattern(src: string, pattern: RegExp): number {
  return (src.match(pattern) ?? []).length;
}

// ---------------------------------------------------------------------------
// Impure: aggregate across a directory tree
// ---------------------------------------------------------------------------

/**
 * Scan a directory for *.spec.(t|j)s files (recursively) and return the
 * aggregate static analysis. Returns null if the directory does not exist or
 * contains no spec files.
 */
export async function analyzeBaselineDir(dir: string): Promise<BaselineStaticAnalysis | null> {
  try {
    await access(dir);
  } catch {
    return null;
  }

  const files = await collectSpecFiles(dir);
  if (files.length === 0) return null;

  const totals: SpecAnalysis = { tests: 0, assertions: 0, locatorCounts: {} };

  for (const file of files) {
    const src = await readFile(file, 'utf8');
    const analysis = analyzeSpecSource(src);
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

async function collectSpecFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.spec\.(t|j)s$/.test(entry.name)) continue;
    // entry.parentPath (Node ≥20.12) or the deprecated entry.path gives the containing dir.
    const dir2: string = ('parentPath' in entry ? entry.parentPath : (entry as { path: string }).path) as string;
    results.push(join(dir2, entry.name));
  }
  return results.sort();
}
