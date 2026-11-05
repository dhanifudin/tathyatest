import type { ManifestEntry } from '../../generate/manifest.js';
import { type FaultRun, type MetricsInput, type FaultMetrics } from './types.js';

// ---- Family C: fault-detection effectiveness --------------------------------------------------

export function faultMetrics(input: MetricsInput): FaultMetrics {
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
  const perFault: FaultMetrics['perFault'] = [];

  for (const fault of faultRuns) {
    const bucket = (byClass[fault.faultClass] ??= { total: 0, killed: 0, score: 0 });
    bucket.total += 1;
    const killers = fault.outcomes.filter((outcome) => outcome.status === 'failed');
    perFault.push({ id: fault.id, faultClass: fault.faultClass, killed: killers.length > 0, expected: fault.expected ?? 'detected' });
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
  const detectable = perFault.filter((row) => row.expected === 'detected');
  const controls = perFault.filter((row) => row.expected === 'survives');
  const detectableKilled = detectable.filter((row) => row.killed).length;
  return {
    total,
    killed,
    mutationScore: total === 0 ? 0 : killed / total,
    byClass,
    localizationAccuracy: killed === 0 ? 0 : localized / killed,
    perFault,
    detectable: { total: detectable.length, killed: detectableKilled, score: detectable.length === 0 ? 0 : detectableKilled / detectable.length },
    controls: { total: controls.length, survived: controls.filter((row) => !row.killed).length },
  };
}
