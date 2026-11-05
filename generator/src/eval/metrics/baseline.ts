import { mannWhitneyU } from '../stats.js';
import { type MetricsInput, type FaultMetrics, type QualityMetrics, type ReliabilityMetrics, type EfficiencyMetrics, type QualitySide, type VerdictRow, type Verdict, type BaselineComparison } from './types.js';
import { faultMetricsOf } from './faults.js';
import { locatorRobustnessOf } from './quality.js';
import { reliabilityOf } from './reliability.js';
import { durationsOf, distinctTitles } from './helpers.js';

export function baselineComparison(
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

export function computeVerdict(
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

export function verdictRow(
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

export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
