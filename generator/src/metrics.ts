import type { CrawlOutput, Field, Form } from './crawl.js';
import type { TathyaConfig } from './config.js';
import { routeShape, type AccessMatrix } from './rbac.js';
import { navScenarioKeysForPage } from './mapper.js';
import type { FaultClass, ManifestEntry } from './manifest.js';
import { confidenceInterval95, fleissKappa, mannWhitneyU, type ConfidenceInterval, type MannWhitneyResult } from './stats.js';
import type { BaselineStaticAnalysis } from './eval/baseline-static.js';

export type TestStatus = 'passed' | 'failed' | 'skipped';
export type TestOutcome = { title: string; project: string; status: TestStatus; durationMs: number };
export type SuiteRun = { outcomes: TestOutcome[] };
export type FaultRun = { id: string; faultClass: FaultClass; outcomes: TestOutcome[] };

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
type CrudExercised = { create: boolean; read: boolean; update: boolean; delete: boolean };

export type FaultMetrics = {
  total: number;
  killed: number;
  mutationScore: number;
  byClass: Record<string, { total: number; killed: number; score: number }>;
  localizationAccuracy: number;
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

// ---- Family A: model / generation coverage ----------------------------------------------------

function coverageMetrics(input: MetricsInput): CoverageMetrics {
  const { manifest, crawls, matrix, config } = input;

  const totalRoutes = new Set<string>();
  const totalForms = new Set<string>();
  const totalFields = new Set<string>();
  const navScenarios = new Set<string>();
  const crudByResource: Record<string, CrudExercised> = {};
  const presentConstraints = new Set<string>();

  for (const crawl of crawls) {
    const seenPageShapes = new Set<string>();
    for (const page of crawl.pages) {
      const route = canonicalPath(page.url);
      // Route coverage is counted at scenario granularity (route shape): the mapper emits one
      // representative test per shape, so per-row concrete routes would undercount forever.
      totalRoutes.add(routeShape(route));
      // Nav scenarios come from the same representative page per shape the mapper processes;
      // duplicate pages (other row ids, other page numbers) offer no new scenarios.
      const firstOfShape = !seenPageShapes.has(routeShape(route));
      seenPageShapes.add(routeShape(route));
      markResource(crudByResource, route, 'read');
      for (const form of page.forms) {
        const formKey = formKeyOf(route, form);
        if (form.fields.length > 0) {
          totalForms.add(formKey);
          for (const field of form.fields) {
            totalFields.add(`${formKey}|${field.name}`);
            for (const kind of constraintKindsOfField(field, config)) presentConstraints.add(kind);
          }
        }
        if (form.crudOp === 'create' || form.crudOp === 'update' || form.crudOp === 'delete') {
          markResource(crudByResource, canonicalPath(form.action), form.crudOp);
        }
      }
      // Nav is counted per unique scenario (per role), mirroring the mapper's dedup keys:
      // ten row-edit links or the navbar on every page are one scenario each.
      if (firstOfShape) {
        for (const key of navScenarioKeysForPage(page, crawl.baseUrl)) {
          navScenarios.add(`${crawl.role}|${key}`);
        }
      }
    }
  }

  const coveredRoutes = new Set(
    manifest
      .map((entry) => entry.route)
      .filter((route): route is string => route !== null)
      .map((route) => routeShape(canonicalPath(route))),
  );
  const coveredForms = new Set(
    manifest
      .filter((entry) => entry.category === 'crud' && entry.targetForm && entry.route)
      .map((entry) => `${routeShape(canonicalPath(entry.route ?? '/'))}|${entry.targetForm}`),
  );
  // A field is covered when its form is exercised at all (the positive case fills every field).
  const coveredFormKeys = new Set([...totalForms].filter((key) => [...coveredForms].some((covered) => keysAlign(covered, key))));
  const coveredFieldCount = [...totalFields].filter((fieldKey) => [...coveredFormKeys].some((formKey) => fieldKey.startsWith(`${formKey}|`))).length;
  const navTests = manifest.filter((entry) => entry.category === 'nav').length;

  const routes = ratio(intersectionSize(totalRoutes, coveredRoutes), totalRoutes.size);
  const forms = ratio(coveredFormKeys.size, totalForms.size);
  const fields = ratio(coveredFieldCount, totalFields.size);
  const nav = ratio(Math.min(navTests, navScenarios.size), navScenarios.size);

  const elementCovered = routes.covered + forms.covered + fields.covered + nav.covered;
  const elementTotal = routes.total + forms.total + fields.total + nav.total;

  const exercisedConstraints = new Set(manifest.map((entry) => entry.constraintKind).filter((kind): kind is string => kind !== null));
  const exercisedPresent = [...exercisedConstraints].filter((kind) => presentConstraints.has(kind));

  return {
    routes,
    forms,
    fields,
    nav,
    element: ratio(elementCovered, elementTotal),
    rbacMatrix: rbacMatrixCoverage(matrix, manifest, config),
    crudByResource,
    constraintKinds: {
      present: [...presentConstraints].sort(),
      exercised: [...exercisedConstraints].sort(),
      ratio: presentConstraints.size === 0 ? 1 : exercisedPresent.length / presentConstraints.size,
    },
    tiers: tierCounts(manifest),
  };
}

function rbacMatrixCoverage(matrix: AccessMatrix, manifest: ManifestEntry[], config: TathyaConfig): Ratio {
  const roles = config.auth.roles.map((role) => role.name);
  // Matrix cells are counted per route SHAPE so the one-representative-per-shape emission of the
  // mapper can still reach full coverage (12 per-row edit routes are one cell, not twelve).
  const asserted = new Set(
    manifest
      .filter((entry): entry is ManifestEntry & { route: string } => entry.category === 'rbac' && entry.route !== null)
      .map((entry) => `${entry.role}:${routeShape(canonicalPath(entry.route))}`),
  );
  const shapes = new Set([...matrix.values()].map((entry) => routeShape(canonicalPath(entry.route))));
  let total = 0;
  let covered = 0;
  for (const shape of shapes) {
    for (const role of roles) {
      total += 1;
      if (asserted.has(`${role}:${shape}`)) covered += 1;
    }
  }
  return ratio(covered, total);
}

function tierCounts(manifest: ManifestEntry[]): CoverageMetrics['tiers'] {
  const tiers = { positive: 0, negative: 0, edge: 0, total: manifest.length };
  for (const entry of manifest) tiers[entry.tier] += 1;
  return tiers;
}

// ---- Family C: fault-detection effectiveness --------------------------------------------------

function faultMetrics(input: MetricsInput): FaultMetrics {
  const byTitle = new Map(input.manifest.map((entry) => [entry.title, entry] as const));
  return faultMetricsOf(input.faultRuns, byTitle);
}

/**
 * Pure: compute fault-detection metrics from fault runs.
 * `byTitle` is the generated-manifest map used for localization; omit (or pass empty map)
 * for the baseline side, where localization is not applicable.
 */
export function faultMetricsOf(
  faultRuns: FaultRun[],
  byTitle: Map<string, ManifestEntry> = new Map(),
): FaultMetrics {
  const byClass: Record<string, { total: number; killed: number; score: number }> = {};
  let killed = 0;
  let localized = 0;

  for (const fault of faultRuns) {
    const bucket = (byClass[fault.faultClass] ??= { total: 0, killed: 0, score: 0 });
    bucket.total += 1;
    const killers = fault.outcomes.filter((outcome) => outcome.status === 'failed');
    if (killers.length > 0) {
      killed += 1;
      bucket.killed += 1;
      if (byTitle.size > 0) {
        const localizedHere = killers.some((outcome) => byTitle.get(outcome.title)?.faultClass === fault.faultClass);
        if (localizedHere) localized += 1;
      }
    }
  }
  for (const bucket of Object.values(byClass)) bucket.score = bucket.total === 0 ? 0 : bucket.killed / bucket.total;

  const total = faultRuns.length;
  return {
    total,
    killed,
    mutationScore: total === 0 ? 0 : killed / total,
    byClass,
    localizationAccuracy: killed === 0 ? 0 : localized / killed,
  };
}

// ---- Family D: test-suite quality -------------------------------------------------------------

const LOCATOR_RANK: Record<string, number> = { testid: 7, role: 6, label: 5, placeholder: 4, id: 3, name: 2, css: 1 };

/**
 * Pure: derive a locator-robustness score (0–1) from a strategy-count distribution.
 * Uses the same LOCATOR_RANK weights as the generated-suite computation in qualityMetrics.
 * Exported so the baseline side and tests can reuse it.
 */
export function locatorRobustnessOf(distribution: Record<string, number>): number {
  let robustnessSum = 0;
  let total = 0;
  for (const [strategy, count] of Object.entries(distribution)) {
    robustnessSum += (LOCATOR_RANK[strategy] ?? 1) / 7 * count;
    total += count;
  }
  return total === 0 ? 0 : robustnessSum / total;
}

function qualityMetrics(input: MetricsInput): QualityMetrics {
  const { manifest } = input;
  const locatorDistribution: Record<string, number> = {};
  let withLocator = 0;
  let brittle = 0;
  let robustnessSum = 0;
  let assertionSum = 0;
  let smell = 0;

  for (const entry of manifest) {
    assertionSum += entry.assertionCount;
    if (entry.assertionCount === 0) smell += 1;
    const strategy = entry.locatorStrategy;
    if (strategy) {
      locatorDistribution[strategy] = (locatorDistribution[strategy] ?? 0) + 1;
      withLocator += 1;
      if (strategy === 'css') brittle += 1;
      robustnessSum += (LOCATOR_RANK[strategy] ?? 1) / 7;
    }
  }

  return {
    testCount: manifest.length,
    assertionDensity: manifest.length === 0 ? 0 : assertionSum / manifest.length,
    locatorDistribution,
    brittleLocatorRatio: withLocator === 0 ? 0 : brittle / withLocator,
    locatorRobustness: withLocator === 0 ? 0 : robustnessSum / withLocator,
    smellIncidence: manifest.length === 0 ? 0 : smell / manifest.length,
  };
}

// ---- Family E: reliability, efficiency, baseline ----------------------------------------------

function reliabilityMetrics(input: MetricsInput): ReliabilityMetrics {
  return reliabilityOf(input.runs);
}

/** Pure: compute reliability metrics from a set of suite runs. Reusable for both sides. */
export function reliabilityOf(runs: SuiteRun[]): ReliabilityMetrics {
  const repeats = runs.length;
  if (repeats === 0) {
    return { repeats: 0, flakeRate: 0, crossBrowserKappa: 1, passRate: 0 };
  }

  // Flake: per (title, project), status differs across repeats.
  const statusByKey = new Map<string, Set<TestStatus>>();
  let passed = 0;
  let counted = 0;
  for (const run of runs) {
    for (const outcome of run.outcomes) {
      const key = `${outcome.project}::${outcome.title}`;
      (statusByKey.get(key) ?? statusByKey.set(key, new Set()).get(key)!).add(outcome.status);
      if (outcome.status !== 'skipped') {
        counted += 1;
        if (outcome.status === 'passed') passed += 1;
      }
    }
  }
  let flaky = 0;
  for (const statuses of statusByKey.values()) {
    if (statuses.size > 1) flaky += 1;
  }

  return {
    repeats,
    flakeRate: statusByKey.size === 0 ? 0 : flaky / statusByKey.size,
    crossBrowserKappa: crossBrowserAgreement(runs[0]),
    passRate: counted === 0 ? 0 : passed / counted,
  };
}

function crossBrowserAgreement(run: SuiteRun): number {
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

function efficiencyMetrics(input: MetricsInput): EfficiencyMetrics {
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

function baselineComparison(
  input: MetricsInput,
  genQuality: QualityMetrics,
  genReliability: ReliabilityMetrics,
  genMutation: FaultMetrics,
  genEfficiency: EfficiencyMetrics,
): BaselineComparison {
  const generatedDurations = durationsOf(input.runs);
  const manualDurations = durationsOf(input.baselineRuns);

  const generatedSide: QualitySide = {
    testCount: genQuality.testCount,
    assertionDensity: genQuality.assertionDensity,
    brittleLocatorRatio: genQuality.brittleLocatorRatio,
    locatorDistribution: genQuality.locatorDistribution,
  };

  const baselineSide: QualitySide | null = input.baselineStatic
    ? {
        testCount: input.baselineStatic.testCount,
        assertionDensity: input.baselineStatic.assertionDensity,
        brittleLocatorRatio: input.baselineStatic.brittleLocatorRatio,
        locatorDistribution: input.baselineStatic.locatorDistribution,
      }
    : null;

  const baselineReliability = input.baselineRuns.length > 0 ? reliabilityOf(input.baselineRuns) : null;
  const baselineMutation = input.baselineFaultRuns.length > 0 ? faultMetricsOf(input.baselineFaultRuns) : null;

  // Duration per test: mean execute ms divided by distinct test count (so count differences don't skew).
  const genDurationPerTest = genEfficiency.perTestMs;
  const baselineTestCount = distinctTitles(input.baselineRuns);
  const baseDurationPerTest = manualDurations.length > 0 && baselineTestCount > 0
    ? manualDurations.reduce((sum, d) => sum + d, 0) / manualDurations.length
    : null;

  const verdict = computeVerdict(
    genQuality, genReliability, genMutation, genDurationPerTest,
    baselineSide, baselineReliability, baselineMutation, baseDurationPerTest,
  );

  return {
    available: input.baselineRuns.length > 0,
    generatedTests: distinctTitles(input.runs),
    manualTests: baselineTestCount,
    durationMannWhitney: generatedDurations.length > 0 && manualDurations.length > 0
      ? mannWhitneyU(generatedDurations, manualDurations)
      : null,
    quality: { generated: generatedSide, baseline: baselineSide },
    baselineReliability,
    baselineMutation,
    verdict,
  };
}

function computeVerdict(
  genQuality: QualityMetrics,
  genReliability: ReliabilityMetrics,
  genMutation: FaultMetrics,
  genDurationPerTest: number,
  baselineSide: QualitySide | null,
  baselineReliability: ReliabilityMetrics | null,
  baselineMutation: FaultMetrics | null,
  baseDurationPerTest: number | null,
): Verdict {
  // Mutation score: n/a if neither side ran any faults.
  const genMutScore = genMutation.total > 0 ? genMutation.mutationScore : null;
  const baseMutScore = baselineMutation && baselineMutation.total > 0 ? baselineMutation.mutationScore : null;

  const rows: VerdictRow[] = [
    verdictRow('Mutation score', genMutScore, baseMutScore, 'higher', fmtPct),
    verdictRow('Flake rate', genReliability.flakeRate, baselineReliability?.flakeRate ?? null, 'lower', fmtPct),
    verdictRow('Pass rate', genReliability.passRate, baselineReliability?.passRate ?? null, 'higher', fmtPct),
    verdictRow('Assertion density', genQuality.assertionDensity, baselineSide?.assertionDensity ?? null, 'higher', (v) => v.toFixed(2)),
    verdictRow('Brittle-locator ratio', genQuality.brittleLocatorRatio, baselineSide?.brittleLocatorRatio ?? null, 'lower', fmtPct),
    verdictRow('Locator robustness', genQuality.locatorRobustness, baselineSide ? locatorRobustnessOf(baselineSide.locatorDistribution) : null, 'higher', fmtPct),
    verdictRow('Duration per test', genDurationPerTest > 0 ? genDurationPerTest : null, baseDurationPerTest, 'lower', (v) => `${Math.round(v)}ms`),
  ];

  const comparable = rows.filter((row) => row.winner !== 'n/a');
  const generatedWins = comparable.filter((row) => row.winner === 'generated').length;
  const baselineWins = comparable.filter((row) => row.winner === 'baseline').length;
  const ties = comparable.filter((row) => row.winner === 'tie').length;
  const overall: Verdict['overall'] = comparable.length === 0 ? 'n/a'
    : generatedWins > baselineWins ? 'generated'
    : baselineWins > generatedWins ? 'baseline'
    : 'tie';

  return { rows, comparableDimensions: comparable.length, generatedWins, baselineWins, ties, overall };
}

function verdictRow(
  metric: string,
  genValue: number | null,
  baseValue: number | null,
  betterWhen: 'higher' | 'lower',
  format: (v: number) => string,
): VerdictRow {
  const generated = genValue !== null ? format(genValue) : 'n/a';
  const baseline = baseValue !== null ? format(baseValue) : 'n/a';

  let winner: VerdictRow['winner'] = 'n/a';
  if (genValue !== null && baseValue !== null) {
    const EPSILON = 0.001; // 0.1% threshold — differences smaller than this are a tie
    const diff = genValue - baseValue;
    if (betterWhen === 'higher') {
      winner = diff > EPSILON ? 'generated' : diff < -EPSILON ? 'baseline' : 'tie';
    } else {
      winner = diff < -EPSILON ? 'generated' : diff > EPSILON ? 'baseline' : 'tie';
    }
  }

  return { metric, generated, baseline, betterWhen, winner };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// ---- helpers ----------------------------------------------------------------------------------

function durationsOf(runs: SuiteRun[]): number[] {
  return runs.flatMap((run) => run.outcomes.filter((outcome) => outcome.status !== 'skipped').map((outcome) => outcome.durationMs));
}

function distinctTitles(runs: SuiteRun[]): number {
  return new Set(runs.flatMap((run) => run.outcomes.map((outcome) => outcome.title))).size;
}

function ratio(covered: number, total: number): Ratio {
  return { covered, total, ratio: total === 0 ? (covered === 0 ? 1 : 0) : covered / total };
}

function intersectionSize(total: Set<string>, covered: Set<string>): number {
  let count = 0;
  for (const value of covered) if (total.has(value)) count += 1;
  return count;
}

function keysAlign(coveredRouteForm: string, formKey: string): boolean {
  // coveredRouteForm = `${routeShape}|${method}:${action}`; formKey = `${routeShape}|${method}|${actionShape}|fields`.
  const [route, methodAction] = coveredRouteForm.split('|', 2);
  const [method, action] = (methodAction ?? '').split(':', 2);
  return formKey.startsWith(`${route}|${method}|${routeShape(action ?? '/')}|`);
}

// Form/field coverage is counted at scenario granularity (route + action shapes), matching
// the mapper's one-representative-per-shape emission — see the totalRoutes comment above.
function formKeyOf(route: string, form: Form): string {
  return `${routeShape(route)}|${form.method}|${routeShape(canonicalPath(form.action))}|${form.fields.map((field) => field.name).join(',')}`;
}

function constraintKindsOfField(field: Field, config: TathyaConfig): string[] {
  const kinds: string[] = [];
  if (field.required) kinds.push('required');
  if (field.constraints.minlength !== null) kinds.push('minlength');
  if (field.constraints.maxlength !== null) kinds.push('maxlength');
  if (field.constraints.min !== null) kinds.push('min');
  if (field.constraints.max !== null) kinds.push('max');
  if (field.constraints.pattern !== null) kinds.push('pattern');
  if (['email', 'url', 'number', 'tel'].includes(field.type)) kinds.push('type');
  if (field.options?.length) kinds.push('option');
  if (config.data.unique.includes(field.name)) kinds.push('unique');
  if (field.nameHints.includes('confirmation') || config.data.confirmFields.includes(field.name)) kinds.push('confirmation');
  if (['text', 'search', 'textarea'].includes(field.type)) kinds.push('robustness');
  return kinds;
}

function markResource(map: Record<string, CrudExercised>, route: string, op: 'create' | 'read' | 'update' | 'delete'): void {
  const resource = resourceOf(route);
  if (!resource) return;
  const entry = (map[resource] ??= { create: false, read: false, update: false, delete: false });
  entry[op] = true;
}

function resourceOf(route: string): string | null {
  const segments = canonicalPath(route).split('/').filter(Boolean);
  return segments[0] ?? null;
}

function canonicalPath(path: string): string {
  try {
    return new URL(path, 'http://tathyatest.local').pathname || '/';
  } catch {
    const [withoutHash] = path.split('#', 1);
    const [withoutQuery] = withoutHash.split('?', 1);
    return withoutQuery || '/';
  }
}
