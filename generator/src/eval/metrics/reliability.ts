import { confidenceInterval95, fleissKappa } from '../stats.js';
import type { SuiteRun, TestStatus } from '../types.js';
import { type MetricsInput, type ReliabilityMetrics, type EfficiencyMetrics } from './types.js';

// ---- Family E: reliability, efficiency, baseline ----------------------------------------------

export function reliabilityMetrics(input: MetricsInput): ReliabilityMetrics {
  return reliabilityOf(input.runs);
}

/**
 * Pure: compute reliability metrics from a set of suite runs. Reusable for both sides.
 *
 * Skipped outcomes are not verdicts: role-gated tests are skipped by every other role's project in
 * every repeat, so they stay out of the flake denominator, the pass rate and the agreement figures.
 * A test that passes in one repeat and is skipped in another is reported separately as an
 * intermittent skip (a runtime `test.skip` can hide a failure, so it must stay visible).
 */
export function reliabilityOf(runs: SuiteRun[]): ReliabilityMetrics {
  const repeats = runs.length;
  if (repeats === 0) {
    return {
      repeats: 0, flakeRate: 0, crossBrowserKappa: 1, passRate: 0, unstable: [],
      kappaPerRepeat: [], agreementRate: 1, disagreeingTests: 0, skippedExecutions: 0, intermittentSkips: [], neverExecuted: [],
    };
  }

  // Flake: per (title, project), the executed status differs across repeats.
  const statusByKey = new Map<string, Set<TestStatus>>();
  const skippedKeys = new Set<string>();
  let passed = 0;
  let counted = 0;
  let skipped = 0;
  for (const run of runs) {
    for (const outcome of run.outcomes) {
      const key = `${outcome.project}::${outcome.title}`;
      if (outcome.status === 'skipped') {
        skipped += 1;
        skippedKeys.add(key);
        continue;
      }
      const statuses = statusByKey.get(key) ?? new Set<TestStatus>();
      statuses.add(outcome.status);
      statusByKey.set(key, statuses);
      counted += 1;
      if (outcome.status === 'passed') passed += 1;
    }
  }
  let flaky = 0;
  const unstable: string[] = [];
  for (const [key, statuses] of statusByKey) {
    if (statuses.size > 1) flaky += 1;
    if (statuses.size > 1 || statuses.has('failed')) unstable.push(labelOf(key));
  }
  const intermittentSkips = [...skippedKeys].filter((key) => statusByKey.has(key)).map(labelOf).sort();
  // Role gates skip a test in other roles' projects; one that ran nowhere was skipped by its own.
  const outcomes = runs.flatMap((run) => run.outcomes);
  const executed = new Set(outcomes.filter((outcome) => outcome.status !== 'skipped').map((outcome) => outcome.title));
  const neverExecuted = [...new Set(outcomes.map((outcome) => outcome.title).filter((title) => !executed.has(title)))].sort();

  const perRepeat = runs.map((run) => crossBrowserStats(run));
  const disagreeing = new Set<string>();
  for (const stats of perRepeat) for (const title of stats.disagreeing) disagreeing.add(title);

  return {
    repeats,
    flakeRate: statusByKey.size === 0 ? 0 : flaky / statusByKey.size,
    crossBrowserKappa: mean(perRepeat.map((stats) => stats.kappa)),
    passRate: counted === 0 ? 0 : passed / counted,
    unstable: unstable.sort(),
    kappaPerRepeat: perRepeat.map((stats) => stats.kappa),
    agreementRate: mean(perRepeat.map((stats) => stats.agreement)),
    disagreeingTests: disagreeing.size,
    skippedExecutions: Math.round(skipped / repeats),
    intermittentSkips,
    neverExecuted,
  };
}

function labelOf(key: string): string {
  const [project, ...title] = key.split('::');
  return `${title.join('::')} [${project}]`;
}

function mean(values: number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type AgreementStats = {
  /** Fleiss kappa across the browser projects that ran each test (1 when there is nothing to disagree about). */
  kappa: number;
  /** Observed agreement: the share of tests on which every browser gave the same verdict. */
  agreement: number;
  /** Titles on which the browsers disagreed in this run. */
  disagreeing: string[];
};

/**
 * Cross-browser agreement of one run. A skip is not a verdict: with per-role projects every test is
 * "skipped" by the other roles' projects, which would register as systematic disagreement. Raters
 * are the browser projects that actually ran the test. Kappa is 1 when every verdict is the same by
 * convention (no variance to explain), which is why percent agreement and the disagreeing titles are
 * reported next to it: kappa alone degenerates under a heavily skewed status distribution.
 */
export function crossBrowserStats(run: SuiteRun): AgreementStats {
  const statuses: TestStatus[] = ['passed', 'failed'];
  const byTitle = new Map<string, number[]>();
  for (const outcome of run.outcomes) {
    if (outcome.status === 'skipped') continue;
    const counts = byTitle.get(outcome.title) ?? statuses.map(() => 0);
    counts[statuses.indexOf(outcome.status)] += 1;
    byTitle.set(outcome.title, counts);
  }
  const raters = Math.max(0, ...[...byTitle.values()].map((counts) => counts.reduce((sum, value) => sum + value, 0)));
  const rated = [...byTitle.entries()].filter(([, counts]) => counts.reduce((sum, value) => sum + value, 0) === raters);
  if (raters < 2 || rated.length === 0) return { kappa: 1, agreement: 1, disagreeing: [] };
  const disagreeing = rated.filter(([, counts]) => counts.filter((count) => count > 0).length > 1).map(([title]) => title);
  return {
    kappa: fleissKappa(rated.map(([, counts]) => counts)),
    agreement: (rated.length - disagreeing.length) / rated.length,
    disagreeing: disagreeing.sort(),
  };
}

/** Kappa of one run (kept for callers that only need the coefficient). */
export function crossBrowserAgreement(run: SuiteRun): number {
  return crossBrowserStats(run).kappa;
}

export function efficiencyMetrics(input: MetricsInput): EfficiencyMetrics {
  const testCount = input.manifest.length;
  const executeMs = confidenceInterval95(input.timings.executeMs.length > 0 ? input.timings.executeMs : [0]);
  const meanExecuteMs = executeMs.mean;
  const totalSeconds = (input.timings.crawlMs + input.timings.generateMs + meanExecuteMs) / 1000;
  const manualSeconds = input.manualBaselineSecPerCase * testCount;
  const ratioValue = totalSeconds === 0 ? 0 : manualSeconds / totalSeconds;
  return {
    crawlMs: input.timings.crawlMs,
    generateMs: input.timings.generateMs,
    executeMs,
    totalSeconds,
    testCount,
    perTestMs: testCount === 0 ? 0 : meanExecuteMs / testCount,
    throughputPerSec: meanExecuteMs === 0 ? 0 : testCount / (meanExecuteMs / 1000),
    timeSavingsRatio: ratioValue,
    // Sensitivity: ±50% on the manual-baseline assumption.
    timeSavingsRange: { low: ratioValue * 0.5, high: ratioValue * 1.5 },
  };
}
