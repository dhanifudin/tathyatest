#!/usr/bin/env node
// Regenerates docs/eval-numbers.tex from the tt eval reports:
//   node generator/scripts/report-to-tex.mjs > docs/eval-numbers.tex
// Reads metrics/report.json (blade, inertia) and metrics-saucedemo/report.json
// (saucedemo). Any value missing from the reports is emitted as \evalTBD so the
// paper still compiles. \evalTBD itself is defined in tathyatest-ieee.tex.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TBD = '\\evalTBD';

function loadStacks(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).stacks ?? [];
}

const byName = new Map(
  [...loadStacks('metrics/report.json'), ...loadStacks('metrics-saucedemo/report.json')].map((s) => [s.name, s]),
);
const subjects = [
  ['Blade', 'blade'],
  ['Inertia', 'inertia'],
  ['Sauce', 'saucedemo'],
];
const laravelSubjects = subjects.slice(0, 2);

// Indonesian decimal comma, LaTeX-safe.
const id = (x, d) => x.toFixed(d).replace('.', '{,}');
const opt = (v, fn) => (v === undefined || v === null ? TBD : fn(v));
const pctFrac = (c) => opt(c, (v) => `${id(v.ratio * 100, 1)}\\% (${v.covered}/${v.total})`);
const pctOnly = (r) => opt(r, (v) => `${id(v * 100, 1)}\\%`);
const scoreFrac = (c) => opt(c, (v) => `${id((v.score ?? v.mutationScore) * 100, 1)}\\% (${v.killed}/${v.total})`);
const locMix = (dist) =>
  opt(dist, (d) => {
    const top = Object.entries(d)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return top.length > 0 ? top.map(([k, n]) => `${k}: ${n}`).join(', ') : TBD;
  });
const seconds = (ms) => opt(ms, (v) => `${id(v / 1000, 1)}~s`);
const execCi = (e) => opt(e, (v) => `${id(v.mean / 1000, 0)}~s $\\pm$ ${id(v.marginOfError / 1000, 0)}~s`);
const savings = (eff) =>
  opt(eff?.timeSavingsRatio, (r) => {
    const range = eff.timeSavingsRange;
    const suffix = range ? ` (${id(range.low, 1)}--${id(range.high, 1)})` : '';
    return `${id(r, 1)}$\\times$${suffix}`;
  });
const mannWhitney = (mw) =>
  opt(mw, (v) => {
    const p = v.pValue < 0.001 ? '$p<0{,}001$' : `$p=${id(v.pValue, 3)}$`;
    return `$U$=${Math.round(v.u)}; ${p}; $r$=${id(v.rankBiserial, 2)}`;
  });
const verdict = (v) =>
  opt(v, (w) => {
    const overall = w.overall === 'generated' ? 'generated' : w.overall === 'baseline' ? 'baseline' : 'seri';
    return `${w.generatedWins}:${w.baselineWins} (${overall})`;
  });

const lines = [];
const emit = (s) => lines.push(s);
const def = (name, value, comment) => emit(`\\newcommand{\\${name}}{${value}} % ${comment}`);

emit('% =====================================================================');
emit('% ANGKA EVALUASI TathyaTest');
emit('% Nilai diisi dari metrics/report.json (Blade, Inertia) dan');
emit('% metrics-saucedemo/report.json (SauceDemo), keduanya hasil `tt eval`.');
emit('% \\evalTBD (---) menandai angka yang menunggu run evaluasi berikutnya.');
emit('% File ini dibangkitkan otomatis:');
emit('%   node generator/scripts/report-to-tex.mjs > docs/eval-numbers.tex');
emit('% =====================================================================');

emit('');
emit('% ---------- EQ1: cakupan model (stacks[].coverage) ----------');
for (const [prefix, name] of subjects) {
  const s = byName.get(name);
  const c = s?.coverage;
  def(`ev${prefix}ElemCov`, pctFrac(c?.element), `stacks[${name}].coverage.element`);
  def(`ev${prefix}RouteCov`, pctFrac(c?.routes), `stacks[${name}].coverage.routes`);
  def(`ev${prefix}FormCov`, pctFrac(c?.forms), `stacks[${name}].coverage.forms`);
  def(`ev${prefix}FieldCov`, pctFrac(c?.fields), `stacks[${name}].coverage.fields`);
  def(`ev${prefix}NavCov`, pctFrac(c?.nav), `stacks[${name}].coverage.nav`);
  def(`ev${prefix}RbacCov`, pctFrac(c?.rbacMatrix), `stacks[${name}].coverage.rbacMatrix`);
  def(`ev${prefix}ConstraintCov`, pctOnly(c?.constraintKinds?.ratio), `stacks[${name}].coverage.constraintKinds.ratio`);
  def(
    `ev${prefix}Tiers`,
    opt(c?.tiers, (t) => `${t.positive}/${t.negative}/${t.edge} (${t.total})`),
    `stacks[${name}].coverage.tiers`,
  );
  def(`ev${prefix}TestCount`, opt(s?.quality?.testCount, String), `stacks[${name}].quality.testCount`);
  emit('');
}

emit('% ---------- EQ2: cakupan kode SUT (stacks[].sutCoverage; PCOV, Laravel saja) ----------');
for (const [prefix, name] of laravelSubjects) {
  const cov = byName.get(name)?.sutCoverage;
  def(`ev${prefix}LineCov`, pctFrac(cov?.lines), `stacks[${name}].sutCoverage.lines`);
  def(`ev${prefix}BranchCov`, pctFrac(cov?.branches), `stacks[${name}].sutCoverage.branches (proksi)`);
  def(`ev${prefix}FuncCov`, pctFrac(cov?.functions), `stacks[${name}].sutCoverage.functions`);
  def(`ev${prefix}RouteExecCov`, pctFrac(cov?.routes), `stacks[${name}].sutCoverage.routes`);
  emit('');
}

emit('% ---------- EQ3: deteksi cacat (stacks[].faults; Laravel saja) ----------');
for (const [prefix, name] of laravelSubjects) {
  const f = byName.get(name)?.faults;
  def(
    `ev${prefix}MutScore`,
    opt(f, (v) => `${id(v.mutationScore * 100, 1)}\\% (${v.killed}/${v.total})`),
    `stacks[${name}].faults.mutationScore (killed/total)`,
  );
  for (const cls of ['validation', 'authz', 'crud', 'pagination', 'auth']) {
    const label = cls.charAt(0).toUpperCase() + cls.slice(1);
    def(`ev${prefix}Mut${label}`, scoreFrac(f?.byClass?.[cls]), `stacks[${name}].faults.byClass.${cls}`);
  }
  def(`ev${prefix}FaultLoc`, pctOnly(f?.localizationAccuracy), `stacks[${name}].faults.localizationAccuracy`);
  emit('');
}

emit('% ---------- EQ4: mutu suite (stacks[].quality + baseline.quality.baseline) ----------');
for (const [prefix, name] of subjects) {
  const s = byName.get(name);
  const q = s?.quality;
  const b = s?.baseline?.quality?.baseline;
  def(`ev${prefix}AssertDensity`, opt(q?.assertionDensity, (v) => id(v, 2)), `stacks[${name}].quality.assertionDensity`);
  def(`ev${prefix}Brittle`, pctOnly(q?.brittleLocatorRatio), `stacks[${name}].quality.brittleLocatorRatio`);
  def(`ev${prefix}Robustness`, pctOnly(q?.locatorRobustness), `stacks[${name}].quality.locatorRobustness`);
  def(`ev${prefix}LocMix`, locMix(q?.locatorDistribution), `stacks[${name}].quality.locatorDistribution (top-3)`);
  def(`ev${prefix}BaseTestCount`, opt(b?.testCount, String), `stacks[${name}].baseline.quality.baseline.testCount`);
  def(
    `ev${prefix}BaseAssertDensity`,
    opt(b?.assertionDensity, (v) => id(v, 2)),
    `stacks[${name}].baseline.quality.baseline.assertionDensity`,
  );
  def(`ev${prefix}BaseBrittle`, pctOnly(b?.brittleLocatorRatio), `stacks[${name}].baseline.quality.baseline.brittleLocatorRatio`);
  def(`ev${prefix}BaseLocMix`, locMix(b?.locatorDistribution), `stacks[${name}].baseline.quality.baseline.locatorDistribution (top-3)`);
  emit('');
}

emit('% ---------- EQ5: keandalan, efisiensi, baseline (stacks[].reliability/efficiency/baseline) ----------');
for (const [prefix, name] of subjects) {
  const s = byName.get(name);
  const rel = s?.reliability;
  const eff = s?.efficiency;
  def(`ev${prefix}Flake`, pctOnly(rel?.flakeRate), `stacks[${name}].reliability.flakeRate`);
  def(`ev${prefix}Kappa`, opt(rel?.crossBrowserKappa, (v) => id(v, 3)), `stacks[${name}].reliability.crossBrowserKappa`);
  def(`ev${prefix}PassRate`, pctOnly(rel?.passRate), `stacks[${name}].reliability.passRate`);
  def(`ev${prefix}CrawlSec`, seconds(eff?.crawlMs), `stacks[${name}].efficiency.crawlMs`);
  def(`ev${prefix}GenMs`, opt(eff?.generateMs, (v) => `${Math.round(v)}~ms`), `stacks[${name}].efficiency.generateMs`);
  def(`ev${prefix}ExecSec`, execCi(eff?.executeMs), `stacks[${name}].efficiency.executeMs (mean ± CI95)`);
  def(`ev${prefix}PerTestSec`, opt(eff?.perTestMs, (v) => `${id(v / 1000, 1)}~s`), `stacks[${name}].efficiency.perTestMs`);
  def(`ev${prefix}Savings`, savings(eff), `stacks[${name}].efficiency.timeSavingsRatio (+range)`);
  def(`ev${prefix}MannWhitney`, mannWhitney(s?.baseline?.durationMannWhitney), `stacks[${name}].baseline.durationMannWhitney (U, p, r)`);
  def(`ev${prefix}Verdict`, verdict(s?.baseline?.verdict), `stacks[${name}].baseline.verdict (wins gen:base, overall)`);
  emit('');
}

process.stdout.write(lines.join('\n'));
