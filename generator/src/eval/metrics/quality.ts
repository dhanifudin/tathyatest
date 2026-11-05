import { type MetricsInput, type QualityMetrics } from './types.js';

// ---- Family D: test-suite quality -------------------------------------------------------------

export const LOCATOR_RANK: Record<string, number> = { testid: 7, role: 6, label: 5, placeholder: 4, id: 3, name: 2, css: 1 };

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

export function qualityMetrics(input: MetricsInput): QualityMetrics {
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
