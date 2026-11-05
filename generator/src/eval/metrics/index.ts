import { faultMetrics } from './faults.js';
import { qualityMetrics } from './quality.js';
import { reliabilityMetrics, efficiencyMetrics } from './reliability.js';
import { coverageMetrics } from './coverage.js';
import { baselineComparison } from './baseline.js';
import type { MetricsInput, MetricsReport } from './types.js';

export * from './types.js';
export { faultMetricsOf } from './faults.js';
export { locatorRobustnessOf } from './quality.js';
export { reliabilityOf } from './reliability.js';
export type { SuiteRun, TestOutcome, TestStatus } from '../types.js';

export function computeMetrics(input: MetricsInput): MetricsReport {
  const faults = faultMetrics(input);
  const quality = qualityMetrics(input);
  const reliability = reliabilityMetrics(input);
  const efficiency = efficiencyMetrics(input);
  return {
    coverage: coverageMetrics(input),
    sutCoverage: input.sutCoverage,
    faults,
    quality,
    reliability,
    efficiency,
    baseline: baselineComparison(input, quality, reliability, faults, efficiency),
  };
}
