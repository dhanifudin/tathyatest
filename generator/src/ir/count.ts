import type { Oracle, TestPlan } from './types.js';

/**
 * How many assertion call sites an oracle becomes in the emitted Playwright spec — what the static
 * analyser (`adapters/playwright/analyze.ts`) counts there, so the manifest cross-check and the
 * static density describe the same thing. Exhaustive: a new oracle does not compile without a weight.
 */
export const ORACLE_ASSERTIONS: Record<Oracle['type'], number> = {
  'server-error': 2,
  'native-invalid': 1,
  'body-graceful': 1,
  'record-gone': 1,
  'state-flipped': 1,
  'query-echo': 1,
  'text-visible': 1,
  landed: 1,
  'no-server-error': 1,
  'route-allowed': 1,
  'route-blocked': 1,
  'route-inferred': 1,
  absent: 1,
  'logged-in': 1,
  'login-rejected': 1,
  'logged-out': 1,
};

/** Assertions of one planned test. */
export function assertionCountOf(plan: TestPlan): number {
  let count = 0;
  for (const step of plan.steps) {
    if (step.kind === 'assert') for (const oracle of step.oracles) count += ORACLE_ASSERTIONS[oracle.type];
  }
  return count;
}
