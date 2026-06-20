import { describe, expect, it } from 'vitest';
import { confidenceInterval95, fleissKappa, mannWhitneyU, mean, stddev } from '../src/stats.js';

describe('stats', () => {
  it('computes mean and sample standard deviation', () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it('builds a Student-t 95% confidence interval', () => {
    const ci = confidenceInterval95([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(ci.mean).toBe(5);
    expect(ci.n).toBe(8);
    // t(df=7)=2.365, ME = 2.365 * 2.138 / sqrt(8) ≈ 1.788
    expect(ci.marginOfError).toBeCloseTo(1.788, 2);
    expect(ci.lower).toBeCloseTo(3.212, 2);
    expect(ci.upper).toBeCloseTo(6.788, 2);
  });

  it('computes Mann-Whitney U with the rank-biserial effect size', () => {
    const separated = mannWhitneyU([1, 2, 3, 4], [5, 6, 7, 8]);
    expect(separated.u).toBe(0);
    expect(separated.rankBiserial).toBe(-1);
    expect(separated.pValue).toBeLessThan(0.05);

    const interleaved = mannWhitneyU([1, 3, 5], [2, 4, 6]);
    expect(interleaved.u1).toBe(3);
    expect(interleaved.u2).toBe(6);
    expect(interleaved.u).toBe(3);
    expect(interleaved.rankBiserial).toBeCloseTo(-0.333, 3);
    expect(interleaved.pValue).toBeGreaterThan(0.05);
  });

  it('computes Fleiss kappa for full agreement and full disagreement', () => {
    expect(fleissKappa([[2, 0], [0, 2]])).toBeCloseTo(1, 6);
    expect(fleissKappa([[1, 1], [1, 1]])).toBeCloseTo(-1, 6);
    expect(fleissKappa([[3, 0], [3, 0]])).toBeCloseTo(1, 6);
  });
});
