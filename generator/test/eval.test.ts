import { describe, expect, it } from 'vitest';
import { parsePlaywrightJson } from '../src/eval/playwright.js';
import { FAULT_CATALOGUE, faultsForClasses } from '../src/eval/faults.js';
import { renderReportJson, renderReportMarkdown, type StackReport } from '../src/eval/report.js';
import type { ManifestEntry } from '../src/manifest.js';
import type { MetricsReport } from '../src/metrics.js';

describe('parsePlaywrightJson', () => {
  it('flattens nested suites/specs/tests into outcomes with normalized status', () => {
    const report = {
      suites: [{
        title: 'forms.spec.ts',
        specs: [
          { title: 'create valid', tests: [{ projectName: 'admin-chromium', results: [{ status: 'passed', duration: 120 }] }] },
        ],
        suites: [{
          title: 'nested',
          specs: [
            { title: 'title required', tests: [{ projectName: 'admin-firefox', results: [{ status: 'timedOut', duration: 5000 }] }] },
            { title: 'skipped one', tests: [{ projectName: 'admin-webkit', results: [{ status: 'skipped', duration: 0 }] }] },
          ],
        }],
      }],
    };
    const run = parsePlaywrightJson(report);
    expect(run.outcomes).toEqual([
      { title: 'create valid', project: 'admin-chromium', status: 'passed', durationMs: 120 },
      { title: 'title required', project: 'admin-firefox', status: 'failed', durationMs: 5000 },
      { title: 'skipped one', project: 'admin-webkit', status: 'skipped', durationMs: 0 },
    ]);
  });

  it('tolerates an empty or malformed report', () => {
    expect(parsePlaywrightJson({}).outcomes).toEqual([]);
    expect(parsePlaywrightJson(null).outcomes).toEqual([]);
  });
});

describe('fault catalogue', () => {
  it('filters by enabled classes', () => {
    const validationOnly = faultsForClasses(['validation']);
    expect(validationOnly.length).toBeGreaterThan(0);
    expect(validationOnly.every((fault) => fault.faultClass === 'validation')).toBe(true);
    expect(faultsForClasses(['validation', 'authz', 'crud', 'pagination', 'auth'])).toHaveLength(FAULT_CATALOGUE.length);
  });

  it('selects the right tests for a fault via the relevance predicate', () => {
    const entry: ManifestEntry = {
      id: 't', title: 'x', category: 'crud', tier: 'negative', role: 'admin', route: '/todos/create',
      targetForm: 'POST:/todos', targetField: 'title', constraintKind: 'required', assertionCount: 1,
      locatorStrategy: 'label', faultClass: 'validation',
    };
    const fault = FAULT_CATALOGUE.find((f) => f.id === 'validation_title_required')!;
    expect(fault.relevant(entry)).toBe(true);
    expect(fault.relevant({ ...entry, targetField: 'body' })).toBe(false);
  });
});

function fakeReport(overrides: Partial<MetricsReport> = {}): MetricsReport {
  const r = (ratio: number) => ({ covered: Math.round(ratio * 10), total: 10, ratio });
  return {
    coverage: {
      routes: r(1), forms: r(0.8), fields: r(0.9), nav: r(0.5), element: r(0.75), rbacMatrix: r(0.5),
      crudByResource: { todos: { create: true, read: true, update: true, delete: false } },
      constraintKinds: { present: ['required', 'maxlength'], exercised: ['required'], ratio: 0.5 },
      tiers: { positive: 5, negative: 8, edge: 3, total: 16 },
    },
    sutCoverage: { lines: r(0.78), branches: r(0.64), functions: r(0.9), routes: r(0.88) },
    faults: { total: 8, killed: 7, mutationScore: 0.875, byClass: { validation: { total: 4, killed: 4, score: 1 } }, localizationAccuracy: 0.9 },
    quality: { testCount: 16, assertionDensity: 1.2, locatorDistribution: { role: 8, label: 6, css: 2 }, brittleLocatorRatio: 0.125, locatorRobustness: 0.8, smellIncidence: 0 },
    reliability: { repeats: 3, flakeRate: 0.01, crossBrowserKappa: 0.94, passRate: 0.98 },
    efficiency: { crawlMs: 1200, generateMs: 300, executeMs: { n: 3, mean: 4000, stddev: 100, marginOfError: 248, lower: 3752, upper: 4248 }, totalSeconds: 5.5, testCount: 16, perTestMs: 250, throughputPerSec: 4, timeSavingsRatio: 160, timeSavingsRange: { low: 80, high: 240 } },
    baseline: { available: false, generatedTests: 16, manualTests: 0, durationMannWhitney: null, quality: { generated: { testCount: 16, assertionDensity: 1.2, brittleLocatorRatio: 0.125, locatorDistribution: { role: 8, label: 6, css: 2 } }, baseline: null } },
    ...overrides,
  };
}

describe('report rendering', () => {
  it('renders per-stack RQ sections in markdown', () => {
    const md = renderReportMarkdown([{ name: 'blade', report: fakeReport() }]);
    expect(md).toContain('## Stack: blade');
    expect(md).toContain('RQ3 — Fault-detection effectiveness');
    expect(md).toContain('Mutation score: 87.5%');
    expect(md).toContain('Cross-browser agreement (Fleiss κ): 0.940');
    expect(md).not.toContain('## Cross-stack comparison'); // single stack
  });

  it('adds a cross-stack comparison table for multiple stacks', () => {
    const stacks: StackReport[] = [
      { name: 'blade', report: fakeReport() },
      { name: 'inertia', report: fakeReport({ faults: { total: 8, killed: 6, mutationScore: 0.75, byClass: {}, localizationAccuracy: 0.8 } }) },
    ];
    const md = renderReportMarkdown(stacks);
    expect(md).toContain('## Cross-stack comparison');
    expect(md).toContain('| Mutation score | 87.5% | 75.0% |');
    const json = renderReportJson(stacks) as { crossStack: unknown[] };
    expect(json.crossStack).toHaveLength(2);
  });
});
