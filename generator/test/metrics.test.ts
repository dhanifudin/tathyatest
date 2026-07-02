import { describe, expect, it } from 'vitest';
import { computeMetrics, faultMetricsOf, locatorRobustnessOf, reliabilityOf, type MetricsInput } from '../src/metrics.js';
import type { CrawlOutput } from '../src/crawl.js';
import type { TathyaConfig } from '../src/config.js';
import type { AccessMatrix } from '../src/rbac.js';
import type { ManifestEntry } from '../src/manifest.js';

const config: TathyaConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  output: { dir: '', language: 'ts' },
  coverage: 'all',
  oracle: { errorSelector: '.text-red-600' },
  auth: { loginPath: '/login', roles: [{ name: 'admin', username: 'a', password: 'b' }, { name: 'user', username: 'c', password: 'd' }] },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
  data: { fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [], faker: { locale: 'en', seed: null } },
  evaluation: { outDir: 'metrics', repeat: 1, manualBaselineSecPerCase: 300, baselineDir: 'tests/manual', faultProject: null, stacks: [], faults: { enabled: true, classes: ['validation', 'authz', 'crud', 'pagination', 'auth'] } },
};

const crawl: CrawlOutput = {
  baseUrl: config.baseUrl, engine: 'rendered', role: 'admin', crawledAt: '2026-06-20T00:00:00Z',
  pages: [{
    url: '/todos/create', title: 'Create', tables: [], links: [], buttons: [],
    forms: [{
      action: '/todos', method: 'POST', crudOp: 'create', noValidate: true,
      fields: [{ name: 'title', type: 'text', label: 'Title', required: true, constraints: { minlength: null, maxlength: 255, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null }, options: null, nameHints: [], locator: { strategy: 'label', value: 'Title' } }],
      submit: { text: 'Create', locator: { strategy: 'role', value: 'button:Create' } },
    }],
  }],
};

const manifest: ManifestEntry[] = [
  { id: 't1', title: 'create valid', category: 'crud', tier: 'positive', role: 'admin', route: '/todos/create', targetForm: 'POST:/todos', targetField: null, constraintKind: null, assertionCount: 1, locatorStrategy: 'label', faultClass: 'crud' },
  { id: 't2', title: 'create title required', category: 'crud', tier: 'negative', role: 'admin', route: '/todos/create', targetForm: 'POST:/todos', targetField: 'title', constraintKind: 'required', assertionCount: 1, locatorStrategy: 'label', faultClass: 'validation' },
  { id: 't3', title: 'user blocked admin', category: 'rbac', tier: 'negative', role: 'user', route: '/todos/create', targetForm: null, targetField: null, constraintKind: null, assertionCount: 1, locatorStrategy: null, faultClass: 'authz' },
];

const matrix: AccessMatrix = new Map([['/todos/create', { route: '/todos/create', reachableBy: ['admin'] }]]);

function baseInput(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    config, manifest, crawls: [crawl], matrix,
    runs: [{ outcomes: [
      { title: 'create valid', project: 'admin-chromium', status: 'passed', durationMs: 100 },
      { title: 'create valid', project: 'admin-firefox', status: 'passed', durationMs: 120 },
    ] }],
    baselineRuns: [],
    baselineStatic: null,
    faultRuns: [
      { id: 'validation_title_required', faultClass: 'validation', outcomes: [{ title: 'create title required', project: 'admin-chromium', status: 'failed', durationMs: 50 }] },
      { id: 'authz_open', faultClass: 'authz', outcomes: [{ title: 'user blocked admin', project: 'user-chromium', status: 'passed', durationMs: 30 }] },
    ],
    baselineFaultRuns: [],
    sutCoverage: { lines: { covered: 80, total: 100, ratio: 0.8 }, branches: { covered: 60, total: 100, ratio: 0.6 }, functions: { covered: 9, total: 11, ratio: 9 / 11 }, routes: { covered: 2, total: 3, ratio: 2 / 3 } },
    timings: { crawlMs: 1000, generateMs: 500, executeMs: [4000, 4200, 3800] },
    manualBaselineSecPerCase: 300,
    ...overrides,
  };
}

describe('computeMetrics', () => {
  it('computes fault-detection metrics with localization', () => {
    const report = computeMetrics(baseInput());
    expect(report.faults.total).toBe(2);
    expect(report.faults.killed).toBe(1);
    expect(report.faults.mutationScore).toBe(0.5);
    expect(report.faults.byClass.validation).toEqual({ total: 1, killed: 1, score: 1 });
    expect(report.faults.byClass.authz).toEqual({ total: 1, killed: 0, score: 0 });
    expect(report.faults.localizationAccuracy).toBe(1);
  });

  it('computes coverage ratios and tier counts', () => {
    const report = computeMetrics(baseInput());
    expect(report.coverage.routes.ratio).toBe(1);
    expect(report.coverage.forms.covered).toBe(1);
    expect(report.coverage.fields.covered).toBe(1);
    expect(report.coverage.tiers).toEqual({ positive: 1, negative: 2, edge: 0, total: 3 });
    expect(report.coverage.crudByResource.todos).toMatchObject({ create: true, read: true });
    // RBAC matrix: 1 route x 2 roles = 2 cells, only user-blocked asserted -> 1/2.
    expect(report.coverage.rbacMatrix).toEqual({ covered: 1, total: 2, ratio: 0.5 });
    expect(report.coverage.constraintKinds.exercised).toContain('required');
  });

  it('computes efficiency with a confidence interval and time-savings ratio', () => {
    const report = computeMetrics(baseInput());
    expect(report.efficiency.testCount).toBe(3);
    expect(report.efficiency.executeMs.mean).toBeCloseTo(4000, 0);
    // total ≈ (1000 + 500 + 4000)/1000 = 5.5s; manual = 300*3 = 900s; ratio ≈ 163.6
    expect(report.efficiency.timeSavingsRatio).toBeGreaterThan(150);
    expect(report.efficiency.executeMs.marginOfError).toBeGreaterThan(0);
  });

  it('reports quality and reliability', () => {
    const report = computeMetrics(baseInput());
    expect(report.quality.assertionDensity).toBe(1);
    expect(report.quality.brittleLocatorRatio).toBe(0);
    expect(report.quality.locatorDistribution.label).toBe(2);
    expect(report.reliability.passRate).toBe(1);
    expect(report.reliability.flakeRate).toBe(0);
  });

  it('marks baseline unavailable when no manual runs are supplied', () => {
    const report = computeMetrics(baseInput());
    expect(report.baseline.available).toBe(false);
    expect(report.baseline.durationMannWhitney).toBeNull();
  });

  it('verdict is all-n/a when no baseline runs or static data are present', () => {
    const report = computeMetrics(baseInput());
    expect(report.baseline.verdict.comparableDimensions).toBe(0);
    expect(report.baseline.verdict.overall).toBe('n/a');
    for (const row of report.baseline.verdict.rows) {
      expect(row.winner).toBe('n/a');
    }
  });
});

describe('locatorRobustnessOf', () => {
  it('returns 0 for an empty distribution', () => {
    expect(locatorRobustnessOf({})).toBe(0);
  });

  it('returns 1 for a pure testid distribution (rank 7/7)', () => {
    expect(locatorRobustnessOf({ testid: 10 })).toBeCloseTo(1, 5);
  });

  it('returns lower score for a pure css distribution (rank 1/7)', () => {
    expect(locatorRobustnessOf({ css: 10 })).toBeCloseTo(1 / 7, 5);
  });

  it('computes weighted mean across mixed strategies', () => {
    // 2 role (6/7 each) + 1 css (1/7) → (2*(6/7) + 1*(1/7)) / 3
    const expected = (2 * (6 / 7) + 1 * (1 / 7)) / 3;
    expect(locatorRobustnessOf({ role: 2, css: 1 })).toBeCloseTo(expected, 5);
  });
});

describe('faultMetricsOf', () => {
  it('computes mutation score without a manifest (baseline side)', () => {
    const faultRuns = [
      { id: 'f1', faultClass: 'validation' as const, outcomes: [{ title: 'some test', project: 'p1', status: 'failed' as const, durationMs: 50 }] },
      { id: 'f2', faultClass: 'authz' as const, outcomes: [{ title: 'other test', project: 'p1', status: 'passed' as const, durationMs: 30 }] },
    ];
    const metrics = faultMetricsOf(faultRuns);
    expect(metrics.total).toBe(2);
    expect(metrics.killed).toBe(1);
    expect(metrics.mutationScore).toBe(0.5);
    // No manifest → localization accuracy is 0
    expect(metrics.localizationAccuracy).toBe(0);
  });

  it('returns zero mutation score when no faults were run', () => {
    const metrics = faultMetricsOf([]);
    expect(metrics.mutationScore).toBe(0);
    expect(metrics.total).toBe(0);
  });
});

describe('reliabilityOf', () => {
  it('detects flaky tests across repeated runs', () => {
    const runs = [
      { outcomes: [{ title: 'login', project: 'chromium', status: 'passed' as const, durationMs: 100 }] },
      { outcomes: [{ title: 'login', project: 'chromium', status: 'failed' as const, durationMs: 80 }] },
    ];
    const r = reliabilityOf(runs);
    expect(r.flakeRate).toBe(1);  // 1 unique key, 1 flaky
    expect(r.repeats).toBe(2);
  });

  it('returns zero flake rate when all runs agree', () => {
    const run = { outcomes: [{ title: 'login', project: 'chromium', status: 'passed' as const, durationMs: 100 }] };
    const r = reliabilityOf([run, run]);
    expect(r.flakeRate).toBe(0);
    expect(r.passRate).toBe(1);
  });
});

describe('verdict', () => {
  it('picks generated winner when generated has higher mutation score', () => {
    // Generated: 2/2 faults killed; baseline: 1/2 faults killed.
    const report = computeMetrics(baseInput({
      baselineFaultRuns: [
        { id: 'validation_title_required', faultClass: 'validation', outcomes: [{ title: 'base test', project: 'p1', status: 'failed', durationMs: 50 }] },
        { id: 'authz_open', faultClass: 'authz', outcomes: [{ title: 'base test2', project: 'p1', status: 'passed', durationMs: 30 }] },
      ],
      // Make generated kill both faults so generated > baseline
      faultRuns: [
        { id: 'validation_title_required', faultClass: 'validation', outcomes: [{ title: 'create title required', project: 'admin-chromium', status: 'failed', durationMs: 50 }] },
        { id: 'authz_open', faultClass: 'authz', outcomes: [{ title: 'user blocked admin', project: 'user-chromium', status: 'failed', durationMs: 30 }] },
      ],
    }));
    const mutRow = report.baseline.verdict.rows.find((r) => r.metric === 'Mutation score');
    expect(mutRow?.winner).toBe('generated');  // generated=1.0 > baseline=0.5
  });

  it('picks baseline winner when baseline has lower flake rate', () => {
    // Generated has one flaky test; baseline is always stable.
    const report = computeMetrics(baseInput({
      runs: [
        { outcomes: [{ title: 'create valid', project: 'admin-chromium', status: 'passed', durationMs: 100 }] },
        { outcomes: [{ title: 'create valid', project: 'admin-chromium', status: 'failed', durationMs: 90 }] },
      ],
      baselineRuns: [
        { outcomes: [{ title: 'base test', project: 'chromium', status: 'passed', durationMs: 200 }] },
        { outcomes: [{ title: 'base test', project: 'chromium', status: 'passed', durationMs: 210 }] },
      ],
    }));
    const flakeRow = report.baseline.verdict.rows.find((r) => r.metric === 'Flake rate');
    expect(flakeRow?.winner).toBe('baseline');  // generated flaky, baseline stable
  });

  it('marks mutation score n/a when no fault runs provided', () => {
    const report = computeMetrics(baseInput({ faultRuns: [], baselineFaultRuns: [] }));
    const mutRow = report.baseline.verdict.rows.find((r) => r.metric === 'Mutation score');
    expect(mutRow?.winner).toBe('n/a');
    expect(mutRow?.generated).toBe('n/a');
    expect(mutRow?.baseline).toBe('n/a');
  });

  it('reports overall winner as generated when it wins more dimensions', () => {
    const report = computeMetrics(baseInput({
      runs: [
        { outcomes: [
          { title: 'create valid', project: 'admin-chromium', status: 'passed', durationMs: 50 },
        ] },
        { outcomes: [
          { title: 'create valid', project: 'admin-chromium', status: 'passed', durationMs: 50 },
        ] },
      ],
      baselineRuns: [
        { outcomes: [{ title: 'base', project: 'p', status: 'passed', durationMs: 500 }] },
        { outcomes: [{ title: 'base', project: 'p', status: 'passed', durationMs: 500 }] },
      ],
      baselineStatic: {
        specFiles: 1, testCount: 1,
        totals: { tests: 1, assertions: 1, locatorCounts: { css: 1 } },
        assertionDensity: 1,
        brittleLocatorRatio: 1,        // baseline has all css (bad)
        locatorDistribution: { css: 1 },
      },
    }));
    const v = report.baseline.verdict;
    // Generated uses label locator (robustness 5/7 ≈ 0.71) vs baseline css (1/7 ≈ 0.14).
    // Generated duration ~50ms, baseline ~500ms → generated wins on duration.
    // Assertion density: 1.0 on both sides → tie.
    // Brittle locator: 0 generated vs 1.0 baseline → generated wins.
    expect(v.overall).toBe('generated');
    expect(v.generatedWins).toBeGreaterThan(v.baselineWins);
  });
});
