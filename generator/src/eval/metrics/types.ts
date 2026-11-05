import type { CrawlOutput } from '../../crawl/model.js';
import type { TathyaConfig } from '../../config.js';
import { type AccessMatrix } from '../../generate/rbac.js';
import type { FaultClass, ManifestEntry } from '../../generate/manifest.js';
import { type ConfidenceInterval, type MannWhitneyResult } from '../stats.js';
import type { BaselineStaticAnalysis } from '../baseline-static.js';
import type { SuiteRun, TestOutcome } from '../types.js';

export type FaultRun = { id: string; faultClass: FaultClass; expected?: 'detected' | 'survives'; outcomes: TestOutcome[] };

export type Ratio = { covered: number; total: number; ratio: number };
export type SutCoverage = { lines: Ratio; branches: Ratio; functions: Ratio; routes: Ratio };
export type Timings = { crawlMs: number; generateMs: number; executeMs: number[] };

export type MetricsInput = {
  config: TathyaConfig;
  manifest: ManifestEntry[];
  crawls: CrawlOutput[];
  matrix: AccessMatrix;
  runs: SuiteRun[];
  baselineRuns: SuiteRun[];
  baselineStatic: BaselineStaticAnalysis | null;
  faultRuns: FaultRun[];
  /** Fault runs executed against the baseline suite (no manifest needed; localization is n/a). */
  baselineFaultRuns: FaultRun[];
  sutCoverage: SutCoverage | null;
  timings: Timings;
  manualBaselineSecPerCase: number;
};

export type CoverageMetrics = {
  /** `read-only` runs skip every mutating case; form/field/CRUD figures then describe GET forms only. */
  mode: 'read-write' | 'read-only';
  routes: Ratio;
  forms: Ratio;
  fields: Ratio;
  nav: Ratio;
  element: Ratio;
  rbacMatrix: Ratio;
  crudByResource: Record<string, CrudExercised>;
  constraintKinds: { present: string[]; exercised: string[]; ratio: number };
  tiers: { positive: number; negative: number; edge: number; total: number };
};
export type CrudExercised = { create: boolean; read: boolean; update: boolean; delete: boolean };

export type FaultMetrics = {
  total: number;
  killed: number;
  mutationScore: number;
  byClass: Record<string, { total: number; killed: number; score: number }>;
  localizationAccuracy: number;
  /** One row per catalogue fault: whether it was detected and whether detection was expected. */
  perFault: { id: string; faultClass: string; killed: boolean; expected: 'detected' | 'survives' }[];
  /** Faults the generator should catch (the denominator of the headline detection rate). */
  detectable: { total: number; killed: number; score: number };
  /** Negative controls: how many were expected to survive and how many did. */
  controls: { total: number; survived: number };
};

export type QualityMetrics = {
  testCount: number;
  assertionDensity: number;
  locatorDistribution: Record<string, number>;
  brittleLocatorRatio: number;
  locatorRobustness: number;
  smellIncidence: number;
};

export type ReliabilityMetrics = {
  repeats: number;
  flakeRate: number;
  crossBrowserKappa: number;
  passRate: number;
  /** Tests (as "title [project]") that failed or changed status across repeats on the clean build. */
  unstable: string[];
};

export type EfficiencyMetrics = {
  crawlMs: number;
  generateMs: number;
  executeMs: ConfidenceInterval;
  totalSeconds: number;
  testCount: number;
  perTestMs: number;
  throughputPerSec: number;
  timeSavingsRatio: number;
  timeSavingsRange: { low: number; high: number };
};

export type QualitySide = {
  testCount: number;
  assertionDensity: number;
  brittleLocatorRatio: number;
  locatorDistribution: Record<string, number>;
};

/** One row in the head-to-head verdict table. */
export type VerdictRow = {
  metric: string;
  generated: string;
  baseline: string;
  betterWhen: 'higher' | 'lower';
  winner: 'generated' | 'baseline' | 'tie' | 'n/a';
};

/** Per-dimension + overall winner of the head-to-head comparison. */
export type Verdict = {
  rows: VerdictRow[];
  comparableDimensions: number;
  generatedWins: number;
  baselineWins: number;
  ties: number;
  overall: 'generated' | 'baseline' | 'tie' | 'n/a';
};

export type BaselineComparison = {
  available: boolean;
  generatedTests: number;
  manualTests: number;
  durationMannWhitney: MannWhitneyResult | null;
  /** Static quality numbers derived from spec sources (independent of execution). */
  quality: {
    generated: QualitySide;
    baseline: QualitySide | null;
  };
  /** Reliability metrics for the baseline suite (requires repeat > 1 to show flake). */
  baselineReliability: ReliabilityMetrics | null;
  /** Fault-detection metrics for the baseline suite (requires faults enabled). */
  baselineMutation: FaultMetrics | null;
  /** Head-to-head verdict across all comparable dimensions. */
  verdict: Verdict;
};

export type MetricsReport = {
  coverage: CoverageMetrics;
  sutCoverage: SutCoverage | null;
  faults: FaultMetrics;
  quality: QualityMetrics;
  reliability: ReliabilityMetrics;
  efficiency: EfficiencyMetrics;
  baseline: BaselineComparison;
};
