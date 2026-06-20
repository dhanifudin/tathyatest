/**
 * Small, dependency-free statistics used by the evaluation report. Pure functions only — unit
 * tested against hand-computed fixtures so the published numbers are defensible.
 */

export type ConfidenceInterval = {
  n: number;
  mean: number;
  stddev: number;
  marginOfError: number;
  lower: number;
  upper: number;
};

export type MannWhitneyResult = {
  n1: number;
  n2: number;
  u: number;        // min(U1, U2)
  u1: number;
  u2: number;
  z: number;
  pValue: number;   // two-tailed, normal approximation with tie correction
  rankBiserial: number; // effect size in [-1, 1]
};

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation (n-1 denominator). */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Two-sided 95% confidence interval for the mean, using Student's t for small samples. */
export function confidenceInterval95(values: number[]): ConfidenceInterval {
  const n = values.length;
  const m = mean(values);
  const s = stddev(values);
  if (n < 2) {
    return { n, mean: m, stddev: s, marginOfError: 0, lower: m, upper: m };
  }
  const t = tCritical95(n - 1);
  const marginOfError = t * (s / Math.sqrt(n));
  return { n, mean: m, stddev: s, marginOfError, lower: m - marginOfError, upper: m + marginOfError };
}

/**
 * Mann-Whitney U test (two independent samples), normal approximation with tie correction, plus
 * the rank-biserial correlation effect size. Suitable for comparing generated vs manual metrics
 * across repeated runs where normality cannot be assumed.
 */
export function mannWhitneyU(a: number[], b: number[]): MannWhitneyResult {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) {
    return { n1, n2, u: 0, u1: 0, u2: 0, z: 0, pValue: 1, rankBiserial: 0 };
  }
  const combined = [
    ...a.map((value) => ({ value, group: 0 })),
    ...b.map((value) => ({ value, group: 1 })),
  ].sort((x, y) => x.value - y.value);

  // Average ranks for ties.
  const ranks = new Array<number>(combined.length);
  let tieSumCorrection = 0;
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].value === combined[i].value) j += 1;
    const averageRank = (i + 1 + (j + 1)) / 2;
    const tieSize = j - i + 1;
    if (tieSize > 1) tieSumCorrection += tieSize ** 3 - tieSize;
    for (let k = i; k <= j; k += 1) ranks[k] = averageRank;
    i = j + 1;
  }

  let rankSum1 = 0;
  for (let k = 0; k < combined.length; k += 1) {
    if (combined[k].group === 0) rankSum1 += ranks[k];
  }
  const u1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const n = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const tieTerm = tieSumCorrection / (n * (n - 1));
  const sigma = Math.sqrt((n1 * n2 / 12) * (n + 1 - tieTerm));
  const z = sigma === 0 ? 0 : (u1 - meanU) / sigma;
  const pValue = 2 * (1 - standardNormalCdf(Math.abs(z)));
  const rankBiserial = (u1 - u2) / (n1 * n2);

  return { n1, n2, u, u1, u2, z, pValue: Math.min(1, Math.max(0, pValue)), rankBiserial };
}

/**
 * Fleiss' kappa for inter-rater agreement. `counts[i][c]` is the number of raters that assigned
 * subject `i` to category `c`; every subject must have the same number of raters. Used for
 * cross-browser status agreement (raters = browser projects, categories = passed/failed/skipped).
 */
export function fleissKappa(counts: number[][]): number {
  const subjects = counts.length;
  if (subjects === 0) return 1;
  const raters = counts[0].reduce((sum, value) => sum + value, 0);
  if (raters <= 1) return 1;

  const categories = counts[0].length;
  const categoryTotals = new Array<number>(categories).fill(0);
  for (const row of counts) {
    for (let c = 0; c < categories; c += 1) categoryTotals[c] += row[c];
  }
  const pj = categoryTotals.map((total) => total / (subjects * raters));
  const pBarE = pj.reduce((sum, p) => sum + p * p, 0);

  let pBar = 0;
  for (const row of counts) {
    const agreement = row.reduce((sum, value) => sum + value * value, 0) - raters;
    pBar += agreement / (raters * (raters - 1));
  }
  pBar /= subjects;

  if (pBarE === 1) return 1; // all raters in one category for every subject
  return (pBar - pBarE) / (1 - pBarE);
}

// Student's t two-tailed 95% critical values by degrees of freedom (1..30), then normal limit.
const T_TABLE_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101,
  19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052,
  28: 2.048, 29: 2.045, 30: 2.042,
};

function tCritical95(df: number): number {
  if (df <= 0) return 12.706;
  if (df <= 30) return T_TABLE_95[df];
  return 1.96;
}

/** Standard normal CDF via an Abramowitz-Stegun erf approximation. */
function standardNormalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
