import { chdir, cwd } from 'node:process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { controlPlaneOf, DEFAULT_CONTROL_PLANE, loadConfig, type ControlPlane, type TathyaConfig } from '../config.js';
import { runCrawl } from '../crawl/crawl.js';
import { assertReachable, isReachable } from '../crawl/reachability.js';
import type { ManifestEntry } from '../generate/manifest.js';
import { generateSuite, type GeneratedSuite } from '../pipeline.js';
import { computeMetrics, type FaultRun, type MetricsInput, type MetricsReport, type SuiteRun, type SutCoverage } from './metrics/index.js';
import { collectProvenance, type Provenance } from './provenance.js';
import { faultsForClasses, loadFaultCatalogue, type FaultSpec } from './faults.js';
import { runPlaywrightJson } from './playwright.js';
import { renderReportJson, renderReportMarkdown, type StackReport } from './report.js';
import { analyzeBaselineDir } from './baseline-static.js';
import { log } from '../logger.js';
import { escapeRegExp } from '../util/escape.js';
import { DEFAULT_PATHS } from '../util/paths.js';

type StackConfig = TathyaConfig['evaluation']['stacks'][number];
export type EvalOptions = {
  /** Evaluate one named entry of `evaluation.stacks`. */
  stack?: string | null;
  /** Evaluate every entry of `evaluation.stacks` (the cross-stack study); unreachable ones are skipped. */
  allStacks?: boolean;
  /** Config file the CLI was pointed at; names and locates the default (current-project) stack. */
  configPath?: string;
  repeat?: number | null;
  faults?: boolean;
  coverage?: boolean;
  baseline?: boolean;
};

export async function runEvaluation(rootConfig: TathyaConfig, options: EvalOptions = {}): Promise<void> {
  const stacks = resolveStacks(rootConfig, options);
  const reports: StackReport[] = [];
  for (const stack of stacks) {
    if (!(await isReachable(stack.baseUrl))) {
      if (options.allStacks) {
        log.warn(`[eval] stack "${stack.name}" (${stack.baseUrl}) is not reachable — skipping`);
        continue;
      }
      await assertReachable(stack.baseUrl);
    }
    log.info(`\n[eval] stack "${stack.name}" (${stack.baseUrl})`);
    const evaluated = await runStack(stack, rootConfig, options);
    reports.push({ name: stack.name, report: evaluated.report, provenance: evaluated.provenance });
  }
  if (reports.length === 0) throw new Error('[eval] no reachable stack to evaluate');
  await writeReports(rootConfig.evaluation.outDir, reports);
  log.info(`\n[eval] wrote ${join(rootConfig.evaluation.outDir, 'report.md')}`);
}

/**
 * Which stacks a `tt eval` invocation covers. The default is the project in front of you — the
 * config the CLI was pointed at, as one stack — so a bare `tt eval` never launches the multi-hour
 * cross-stack study by accident; `--stack <name>` picks one configured entry and `--all-stacks`
 * runs them all.
 */
export function resolveStacks(config: TathyaConfig, options: Pick<EvalOptions, 'stack' | 'allStacks' | 'configPath'> = {}): StackConfig[] {
  const configured = config.evaluation.stacks;
  const configPath = options.configPath ?? DEFAULT_PATHS.configFile;
  const current: StackConfig = { name: stackNameFor(configPath), dir: '.', config: configPath, baseUrl: config.baseUrl };
  if (options.stack) {
    const match = configured.find((stack) => stack.name === options.stack);
    if (!match) {
      const names = configured.map((stack) => stack.name).join(', ') || '(none configured)';
      throw new Error(`Unknown stack "${options.stack}"; evaluation.stacks has: ${names}`);
    }
    return [match];
  }
  if (options.allStacks && configured.length > 0) return configured;
  return [current];
}

/** `tathya.config.yaml` → `default`, `tathya.blade.config.yaml` → `blade`, `shop.yaml` → `shop`. */
export function stackNameFor(configPath: string): string {
  const base = basename(configPath).replace(/\.ya?ml$/i, '');
  const name = base.split('.').filter((part) => part !== 'tathya' && part !== 'config').join('-');
  return name || 'default';
}

/**
 * A stack declares `coverage` / `faults` only when it wants to override detection: left unset,
 * the app is probed for the control-plane endpoints `tt eval` relies on.
 */
export async function detectCapabilities(
  stack: Pick<StackConfig, 'baseUrl' | 'coverage' | 'faults'>,
  plane: ControlPlane = { ...DEFAULT_CONTROL_PLANE },
): Promise<{ coverage: boolean; faults: boolean }> {
  const coverage = stack.coverage !== undefined
    ? stack.coverage !== 'none'
    : await control(stack.baseUrl, 'GET', plane.coverage);
  const faults = stack.faults !== undefined
    ? stack.faults
    : await control(stack.baseUrl, 'POST', plane.faultClear);
  return { coverage, faults };
}

async function runStack(stack: StackConfig, rootConfig: TathyaConfig, options: EvalOptions): Promise<{ report: MetricsReport; provenance: Provenance }> {
  const originalCwd = cwd();
  const originalTathyaConfig = process.env.TATHYA_CONFIG;
  chdir(resolve(originalCwd, stack.dir));
  // Point the spawned Playwright runs (root playwright.config.ts + global setup read this) at the
  // stack's config so baseURL, roles, and storage states match the stack under evaluation.
  process.env.TATHYA_CONFIG = stack.config;
  try {
    const config = await loadConfig(stack.config);
    const repeat = options.repeat ?? rootConfig.evaluation.repeat;
    const plane = controlPlaneOf(rootConfig);
    const catalogue = await loadFaultCatalogue(rootConfig.evaluation.faults.catalogue);
    const capabilities = await detectCapabilities(stack, plane);
    log.info(`[eval] SUT coverage: ${capabilities.coverage ? 'on' : 'off'}; fault injection: ${capabilities.faults ? 'on' : 'off'}${stack.coverage === undefined && stack.faults === undefined ? ' (probed)' : ''}`);
    const collectCoverage = options.coverage !== false && capabilities.coverage;

    if (collectCoverage) await control(stack.baseUrl, 'POST', plane.coverageReset);

    const crawlMs = await timed(() => runCrawl(config));
    // Coverage attribution: what the crawl alone reaches is recorded and reset, so the figure reported for
    // the generated suite is not inflated by the crawl, by the baseline suite, or by fault runs.
    const crawlCoverage = collectCoverage ? await fetchCoverage(stack.baseUrl, plane.coverage) : null;
    if (collectCoverage) await control(stack.baseUrl, 'POST', plane.coverageReset);

    let suite!: GeneratedSuite;
    const generateMs = await timed(async () => {
      suite = await generateSuite(config);
    });
    const { crawls, matrix, manifest } = suite;

    // Generated and baseline repeats alternate (generated first, then swapped each round) so host or
    // live-site drift is not confounded with the suite under test. Coverage is read right after the
    // first generated run, before any baseline test executes.
    const runs: SuiteRun[] = [];
    const baselineRuns: SuiteRun[] = [];
    const executeMs: number[] = [];
    const runBaselineToo = options.baseline !== false;
    let sutCoverage: SutCoverage | null = null;
    for (let i = 0; i < repeat; i += 1) {
      const order = i % 2 === 0 ? (['generated', 'baseline'] as const) : (['baseline', 'generated'] as const);
      for (const which of order) {
        if (which === 'generated') {
          const start = Date.now();
          runs.push(await runPlaywrightJson({ cwd: '.' }));
          executeMs.push(Date.now() - start);
          if (i === 0 && collectCoverage) sutCoverage = await fetchCoverage(stack.baseUrl, plane.coverage);
        } else if (runBaselineToo) {
          baselineRuns.push(...(await runBaselineOnce(config)));
        }
      }
    }
    const baselineStatic = await analyzeBaselineDir(config.evaluation.baselineDir);
    // The generated suite goes through the same analyser; its shared helper module is skipped because
    // helper calls are already counted as assertions where the specs call them.
    const generatedStatic = await analyzeBaselineDir(config.output.dir, { ignorePath: /[\\/]support[\\/]tathya\.(ts|js)$/ });
    // Skip fault injection when the app has no fault endpoint (probed or `faults: false`) or when
    // disabled by flag/config.
    const runFaultsEnabled = capabilities.faults && options.faults !== false && rootConfig.evaluation.faults.enabled;
    const faultRuns = runFaultsEnabled ? await runFaults(stack, rootConfig, config, manifest, plane, catalogue) : [];
    const baselineFaultRuns = runFaultsEnabled ? await runBaselineFaults(stack, rootConfig, config, plane, catalogue) : [];

    if (collectCoverage) await control(stack.baseUrl, 'POST', plane.coverageReset);

    const input: MetricsInput = {
      config, manifest, crawls, matrix, runs, baselineRuns, baselineStatic, generatedStatic,
      faultRuns, baselineFaultRuns, sutCoverage, crawlCoverage,
      timings: { crawlMs, generateMs, executeMs },
      manualBaselineSecPerCase: rootConfig.evaluation.manualBaselineSecPerCase,
    };
    const provenance = collectProvenance({
      configPath: stack.config,
      repeat,
      fakerSeed: config.data.faker.seed ?? null,
      comparisonBrowser: config.evaluation.comparisonBrowser ?? null,
      faultProject: rootConfig.evaluation.faultProject,
      coverage: collectCoverage,
      faultInjection: runFaultsEnabled,
      baseline: runBaselineToo,
      serverMode: collectCoverage ? 'COVERAGE=1 (PCOV)' : 'plain',
    });
    return { report: computeMetrics(input), provenance };
  } finally {
    if (originalTathyaConfig === undefined) delete process.env.TATHYA_CONFIG;
    else process.env.TATHYA_CONFIG = originalTathyaConfig;
    chdir(originalCwd);
  }
}

/** One execution of the manual or public baseline suite (empty when the baseline directory has no specs). */
async function runBaselineOnce(config: TathyaConfig): Promise<SuiteRun[]> {
  const dir = config.evaluation.baselineDir;
  if (!(await hasSpecs(dir))) return [];
  // If the baseline dir ships its own playwright.config.ts, use it so the
  // public suites run under their own setup (no role storageState, correct baseURL).
  const standaloneConfig = join(dir, 'playwright.config.ts');
  const hasConfig = await access(standaloneConfig).then(() => true).catch(() => false);
  // The root config's testDir points at tests/generated; retarget it or the baseline
  // path filter matches zero tests and the run is silently empty.
  return [hasConfig
    ? await runPlaywrightJson({ cwd: '.', config: standaloneConfig })
    : await runPlaywrightJson({ cwd: '.', env: { TATHYA_TESTDIR: dir } })];
}

/**
 * Run the baseline suite once under each fault activation to produce a baseline mutation score.
 * A fault is killed when any baseline test fails while the fault is active.
 * Localization accuracy is not computed (baseline titles don't map to the fault catalogue).
 */
async function runBaselineFaults(stack: StackConfig, rootConfig: TathyaConfig, config: TathyaConfig, plane: ControlPlane, catalogue: FaultSpec[]): Promise<FaultRun[]> {
  const dir = config.evaluation.baselineDir;
  if (!(await hasSpecs(dir))) return [];
  const faults = faultsForClasses(rootConfig.evaluation.faults.classes, catalogue);
  const standaloneConfig = join(dir, 'playwright.config.ts');
  const hasConfig = await access(standaloneConfig).then(() => true).catch(() => false);
  const faultRuns: FaultRun[] = [];
  for (const fault of faults) {
    const set = await control(stack.baseUrl, 'POST', plane.fault, { id: fault.id });
    if (!set) {
      log.warn(`[eval] could not activate fault ${fault.id} for baseline; skipping`);
      continue;
    }
    const suite = hasConfig
      ? await runPlaywrightJson({ cwd: '.', config: standaloneConfig })
      : await runPlaywrightJson({ cwd: '.', env: { TATHYA_TESTDIR: dir } });
    faultRuns.push({ id: fault.id, faultClass: fault.faultClass, expected: fault.expected, outcomes: suite.outcomes });
  }
  await control(stack.baseUrl, 'POST', plane.faultClear);
  return faultRuns;
}

async function hasSpecs(dir: string): Promise<boolean> {
  try {
    await access(dir);
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries.some((entry) => entry.isFile() && /\.spec\.(t|j)s$/.test(entry.name));
  } catch {
    return false;
  }
}

async function runFaults(stack: StackConfig, rootConfig: TathyaConfig, config: TathyaConfig, manifest: ManifestEntry[], plane: ControlPlane, catalogue: FaultSpec[]): Promise<FaultRun[]> {
  const byTitle = new Map(manifest.map((entry) => [entry.title, entry] as const));
  const faults = faultsForClasses(rootConfig.evaluation.faults.classes, catalogue);
  // faultProject names a browser (e.g. chromium); with per-role projects the real project names
  // are `${role}-${browser}`, and every role must still run so role-dependent faults (authz) hit
  // their relevant tests.
  const faultProject = rootConfig.evaluation.faultProject;
  const roleNames = config.auth.roles.map((role) => role.name);
  const projects = faultProject
    ? (roleNames.length > 0 ? roleNames.map((role) => `${role}-${faultProject}`) : [faultProject])
    : undefined;
  const faultRuns: FaultRun[] = [];
  for (const fault of faults) {
    // Only the tests the fault is relevant to count towards its mutation score, so restrict the
    // run to those titles instead of executing the whole suite once per fault.
    const relevantEntries = manifest.filter((entry) => fault.relevant(entry));
    if (relevantEntries.length === 0) {
      faultRuns.push({ id: fault.id, faultClass: fault.faultClass, expected: fault.expected, outcomes: [] });
      continue;
    }
    const set = await control(stack.baseUrl, 'POST', plane.fault, { id: fault.id });
    if (!set) {
      log.warn(`[eval] could not activate fault ${fault.id}; skipping`);
      continue;
    }
    const grep = relevantEntries.map((entry) => escapeRegExp(entry.title)).join('|');
    const suite = await runPlaywrightJson({ cwd: '.', projects, grep });
    const relevant = suite.outcomes.filter((outcome) => {
      const entry = byTitle.get(outcome.title);
      return entry ? fault.relevant(entry) : false;
    });
    faultRuns.push({ id: fault.id, faultClass: fault.faultClass, expected: fault.expected, outcomes: relevant });
  }
  await control(stack.baseUrl, 'POST', plane.faultClear);
  return faultRuns;
}


async function fetchCoverage(baseUrl: string, path: string): Promise<SutCoverage | null> {
  try {
    const response = await fetch(new URL(path, baseUrl));
    if (!response.ok) return null;
    const data = await response.json() as Partial<Record<'lines' | 'branches' | 'functions' | 'routes', { covered: number; total: number }>>;
    return {
      lines: ratio(data.lines),
      branches: ratio(data.branches),
      functions: ratio(data.functions),
      routes: ratio(data.routes),
    };
  } catch {
    return null;
  }
}

function ratio(value: { covered: number; total: number } | undefined) {
  const covered = value?.covered ?? 0;
  const total = value?.total ?? 0;
  return { covered, total, ratio: total === 0 ? 0 : covered / total };
}

async function control(baseUrl: string, method: 'POST' | 'GET', path: string, body?: unknown): Promise<boolean> {
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function timed(action: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await action();
  return Date.now() - start;
}

/**
 * Write one report folder per stack (`<outDir>/<stack>/report.{json,md}`), then rebuild the merged view
 * (`<outDir>/report.{json,md}`) from every stack folder found, so evaluating one stack at a time (the way
 * a small machine has to) accumulates instead of overwriting the other stacks' results.
 */
async function writeReports(outDir: string, reports: StackReport[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const stack of reports) {
    const dir = join(outDir, stack.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'report.json'), `${JSON.stringify(renderReportJson([stack]), null, 2)}\n`);
    await writeFile(join(dir, 'report.md'), renderReportMarkdown([stack]));
  }
  const merged = await loadStackReports(outDir);
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(renderReportJson(merged), null, 2)}\n`);
  await writeFile(join(outDir, 'report.md'), renderReportMarkdown(merged));
}

/** Read every `<outDir>/<stack>/report.json` back into stack reports, ordered by stack name. */
export async function loadStackReports(outDir: string): Promise<StackReport[]> {
  const found: StackReport[] = [];
  for (const entry of await readdir(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const parsed = JSON.parse(await readFile(join(outDir, entry.name, 'report.json'), 'utf8')) as { stacks?: Array<{ name: string; provenance?: Provenance | null } & MetricsReport> };
      for (const { name, provenance, ...report } of parsed.stacks ?? []) {
        found.push({ name, report: report as MetricsReport, provenance: provenance ?? undefined });
      }
    } catch {
      // A folder without a report (for example an old run) is not a stack.
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
