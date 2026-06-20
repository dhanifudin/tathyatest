import type { MetricsReport, QualitySide, Ratio } from '../metrics.js';

export type StackReport = { name: string; report: MetricsReport };

export function renderReportJson(stacks: StackReport[]): object {
  return {
    generatedAt: new Date().toISOString(),
    stacks: stacks.map((stack) => ({ name: stack.name, ...stack.report })),
    crossStack: crossStackTable(stacks),
  };
}

export function renderReportMarkdown(stacks: StackReport[]): string {
  const lines: string[] = ['# TathyaTest evaluation report', '', `Generated: ${new Date().toISOString()}`, ''];
  if (stacks.length > 1) {
    lines.push('## Cross-stack comparison', '', ...crossStackMarkdown(stacks), '');
  }
  for (const stack of stacks) {
    lines.push(...stackMarkdown(stack));
  }
  return `${lines.join('\n')}\n`;
}

function stackMarkdown(stack: StackReport): string[] {
  const { report } = stack;
  const out: string[] = [`## Stack: ${stack.name}`, ''];

  out.push('### RQ1 — Model / generation coverage', '');
  out.push(`- Element coverage: ${ratioPct(report.coverage.element)}`);
  out.push(`- Route coverage: ${ratioPct(report.coverage.routes)}`);
  out.push(`- Form coverage: ${ratioPct(report.coverage.forms)}`);
  out.push(`- Field coverage: ${ratioPct(report.coverage.fields)}`);
  out.push(`- Navigation coverage: ${ratioPct(report.coverage.nav)}`);
  out.push(`- RBAC matrix coverage: ${ratioPct(report.coverage.rbacMatrix)}`);
  out.push(`- Constraint-kind coverage: ${pct(report.coverage.constraintKinds.ratio)} (exercised: ${report.coverage.constraintKinds.exercised.join(', ') || 'none'})`);
  out.push(`- Tiers: ${report.coverage.tiers.positive} positive / ${report.coverage.tiers.negative} negative / ${report.coverage.tiers.edge} edge (${report.coverage.tiers.total} total)`);
  out.push('- CRUD per resource:');
  for (const [resource, ops] of Object.entries(report.coverage.crudByResource)) {
    out.push(`  - ${resource}: ${(['create', 'read', 'update', 'delete'] as const).filter((op) => ops[op]).join('/') || 'none'}`);
  }
  out.push('');

  out.push('### RQ2 — System-under-test code coverage', '');
  if (report.sutCoverage) {
    out.push(`- Lines: ${ratioPct(report.sutCoverage.lines)}`);
    out.push(`- Branches: ${ratioPct(report.sutCoverage.branches)}`);
    out.push(`- Functions: ${ratioPct(report.sutCoverage.functions)}`);
    out.push(`- Routes: ${ratioPct(report.sutCoverage.routes)}`);
  } else {
    out.push('- Not collected (coverage instrumentation disabled for this stack).');
  }
  out.push('');

  out.push('### RQ3 — Fault-detection effectiveness', '');
  out.push(`- Mutation score: ${pct(report.faults.mutationScore)} (${report.faults.killed}/${report.faults.total} faults killed)`);
  out.push(`- Fault-localization accuracy: ${pct(report.faults.localizationAccuracy)}`);
  for (const [klass, stat] of Object.entries(report.faults.byClass)) {
    out.push(`  - ${klass}: ${pct(stat.score)} (${stat.killed}/${stat.total})`);
  }
  out.push('');

  out.push('### RQ4 — Test-suite quality', '');
  out.push(`- Assertion density: ${report.quality.assertionDensity.toFixed(2)} assertions/test`);
  out.push(`- Brittle-locator ratio: ${pct(report.quality.brittleLocatorRatio)}`);
  out.push(`- Locator robustness: ${pct(report.quality.locatorRobustness)}`);
  out.push(`- Smell incidence: ${pct(report.quality.smellIncidence)}`);
  out.push(`- Locator strategy mix: ${Object.entries(report.quality.locatorDistribution).map(([strategy, count]) => `${strategy} ${count}`).join(', ') || 'none'}`);
  out.push('');

  out.push('### RQ5 — Reliability, efficiency & baseline', '');
  out.push(`- Repeats: ${report.reliability.repeats}`);
  out.push(`- Flake rate: ${pct(report.reliability.flakeRate)}`);
  out.push(`- Cross-browser agreement (Fleiss κ): ${report.reliability.crossBrowserKappa.toFixed(3)}`);
  out.push(`- Pass rate: ${pct(report.reliability.passRate)}`);
  out.push(`- Crawl: ${ms(report.efficiency.crawlMs)}; generate: ${ms(report.efficiency.generateMs)}; execute: ${ms(report.efficiency.executeMs.mean)} ± ${ms(report.efficiency.executeMs.marginOfError)} (95% CI, n=${report.efficiency.executeMs.n})`);
  out.push(`- Throughput: ${report.efficiency.throughputPerSec.toFixed(2)} tests/s over ${report.efficiency.testCount} tests`);
  out.push(`- Time-savings ratio vs manual: ${report.efficiency.timeSavingsRatio.toFixed(1)}× (sensitivity ${report.efficiency.timeSavingsRange.low.toFixed(1)}–${report.efficiency.timeSavingsRange.high.toFixed(1)}×)`);
  if (report.baseline.available && report.baseline.durationMannWhitney) {
    const mw = report.baseline.durationMannWhitney;
    out.push(`- Generated vs baseline duration: Mann-Whitney U=${mw.u}, p=${mw.pValue.toFixed(4)}, rank-biserial r=${mw.rankBiserial.toFixed(3)} (${report.baseline.generatedTests} generated vs ${report.baseline.manualTests} baseline tests)`);
  } else {
    out.push('- Baseline duration comparison: not available (no baseline run or too few data points).');
  }
  out.push('');
  out.push('#### Generated vs baseline — static quality comparison', '');
  out.push(...qualityComparisonTable(report));
  out.push('');
  return out;
}

function crossStackTable(stacks: StackReport[]): Array<Record<string, number>> {
  return stacks.map((stack) => ({
    mutationScore: round(stack.report.faults.mutationScore),
    lineCoverage: round(stack.report.sutCoverage?.lines.ratio ?? 0),
    elementCoverage: round(stack.report.coverage.element.ratio),
    flakeRate: round(stack.report.reliability.flakeRate),
    generateMs: Math.round(stack.report.efficiency.generateMs),
  }));
}

function crossStackMarkdown(stacks: StackReport[]): string[] {
  const header = '| Metric | ' + stacks.map((stack) => stack.name).join(' | ') + ' |';
  const divider = '| --- | ' + stacks.map(() => '---').join(' | ') + ' |';
  const rows: Array<[string, (stack: StackReport) => string]> = [
    ['Mutation score', (stack) => pct(stack.report.faults.mutationScore)],
    ['SUT line coverage', (stack) => stack.report.sutCoverage ? pct(stack.report.sutCoverage.lines.ratio) : 'n/a'],
    ['Element coverage', (stack) => pct(stack.report.coverage.element.ratio)],
    ['Flake rate', (stack) => pct(stack.report.reliability.flakeRate)],
    ['Generate time', (stack) => ms(stack.report.efficiency.generateMs)],
  ];
  return [header, divider, ...rows.map(([label, value]) => `| ${label} | ${stacks.map(value).join(' | ')} |`)];
}

function qualityComparisonTable(report: MetricsReport): string[] {
  const gen = report.baseline.quality.generated;
  const bas = report.baseline.quality.baseline;
  const basLabel = bas ? 'Baseline' : 'Baseline (n/a)';
  const header = `| Metric | Generated | ${basLabel} |`;
  const divider = '| --- | --- | --- |';
  const rows: Array<[string, string, string]> = [
    ['Test count', String(gen.testCount), bas ? String(bas.testCount) : 'n/a'],
    ['Assertion density', gen.assertionDensity.toFixed(2), bas ? bas.assertionDensity.toFixed(2) : 'n/a'],
    ['Brittle-locator ratio', pct(gen.brittleLocatorRatio), bas ? pct(bas.brittleLocatorRatio) : 'n/a'],
    ['Locator mix (top)', formatLocatorMix(gen), bas ? formatLocatorMix(bas) : 'n/a'],
  ];
  return [header, divider, ...rows.map(([label, g, b]) => `| ${label} | ${g} | ${b} |`)];
}

function formatLocatorMix(side: QualitySide): string {
  const entries = Object.entries(side.locatorDistribution)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (entries.length === 0) return 'none';
  return entries.map(([k, v]) => `${k}:${v}`).join(', ');
}

function ratioPct(r: Ratio): string {
  return `${pct(r.ratio)} (${r.covered}/${r.total})`;
}
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
function ms(value: number): string {
  return `${Math.round(value)}ms`;
}
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
