import { confidenceInterval95, fleissKappa } from '../stats.js';
import type { SuiteRun, TestStatus } from '../types.js';
import { type MetricsInput, type ReliabilityMetrics, type EfficiencyMetrics } from './types.js';

// ---- Family E: reliability, efficiency, baseline ----------------------------------------------

export function reliabilityMetrics(input: MetricsInput): ReliabilityMetrics {
  return reliabilityOf(input.runs);
}

/** Pure: compute reliability metrics from a set of suite runs. Reusable for both sides. */
export function reliabilityOf(runs: SuiteRun[]): ReliabilityMetrics {
  const repeats = runs.length;
  if (repeats === 0) {
    return { repeats: 0, flakeRate: 0, crossBrowserKappa: 1, passRate: 0, unstable: [] };
  }

  // Flake: per (title, project), status differs across repeats.
  const statusByKey = new Map<string, Set<TestStatus>>();
  let passed = 0;
  let counted = 0;
  for (const run of runs) {
    for (const outcome of run.outcomes) {
      const key = `${outcome.project}::${outcome.title}`;
      const statuses = statusByKey.get(key) ?? new Set<TestStatus>();
      statuses.add(outcome.status);
      statusByKey.set(key, statuses);
      if (outcome.status !== 'skipped') {
        counted += 1;
        if (outcome.status === 'passed') passed += 1;
      }
    }
  }
  let flaky = 0;
  const unstable: string[] = [];
  for (const [key, statuses] of statusByKey) {
    if (statuses.size > 1) flaky += 1;
    if (statuses.size > 1 || statuses.has('failed')) {
      const [project, ...title] = key.split('::');
      unstable.push(`${title.join('::')} [${project}]`);
    }
  }

  return {
    repeats,
    flakeRate: statusByKey.size === 0 ? 0 : flaky / statusByKey.size,
    crossBrowserKappa: crossBrowserAgreement(runs[0]),
    passRate: counted === 0 ? 0 : passed / counted,
    unstable: unstable.sort(),
  };
}

export function crossBrowserAgreement(run: SuiteRun): number {
  // A skip is not a verdict: with per-role projects every test is "skipped" by the other
  // roles' projects, which would register as systematic disagreement (negative kappa).
  // Raters are the browser projects that actually ran the test.
  const statuses: TestStatus[] = ['passed', 'failed'];
  const byTitle = new Map<string, number[]>();
  for (const outcome of run.outcomes) {
    if (outcome.status === 'skipped') continue;
    const counts = byTitle.get(outcome.title) ?? statuses.map(() => 0);
    counts[statuses.indexOf(outcome.status)] += 1;
    byTitle.set(outcome.title, counts);
  }
  // Keep only subjects rated by every browser project (consistent rater count for Fleiss).
  const raters = Math.max(0, ...[...byTitle.values()].map((counts) => counts.reduce((sum, value) => sum + value, 0)));
  const subjects = [...byTitle.values()].filter((counts) => counts.reduce((sum, value) => sum + value, 0) === raters);
  if (raters < 2 || subjects.length === 0) return 1;
  return fleissKappa(subjects);
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
