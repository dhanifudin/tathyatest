import { chdir, cwd } from 'node:process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig, type TathyaConfig } from '../config.js';
import { loadCrawls, runCrawl } from '../crawl.js';
import { buildAccessMatrix } from '../rbac.js';
import { mapTestCases } from '../mapper.js';
import { emit } from '../emit/index.js';
import { buildManifest } from '../manifest.js';
import { computeMetrics, type FaultRun, type SuiteRun, type SutCoverage, type MetricsInput } from '../metrics.js';
import { faultsForClasses } from './faults.js';
import { runPlaywrightJson } from './playwright.js';
import { renderReportJson, renderReportMarkdown, type StackReport } from './report.js';
import { analyzeBaselineDir } from './baseline-static.js';

type StackConfig = TathyaConfig['evaluation']['stacks'][number];
export type EvalOptions = { stack?: string | null; repeat?: number | null; faults?: boolean; coverage?: boolean; baseline?: boolean };

export async function runEvaluation(rootConfig: TathyaConfig, options: EvalOptions = {}): Promise<void> {
  const stacks = resolveStacks(rootConfig, options.stack);
  const reports: StackReport[] = [];
  for (const stack of stacks) {
    console.log(`\n[eval] stack "${stack.name}" (${stack.baseUrl})`);
    reports.push({ name: stack.name, report: await runStack(stack, rootConfig, options) });
  }
  await writeReports(rootConfig.evaluation.outDir, reports);
  console.log(`\n[eval] wrote ${join(rootConfig.evaluation.outDir, 'report.md')}`);
}

function resolveStacks(config: TathyaConfig, only?: string | null): StackConfig[] {
  const stacks = config.evaluation.stacks.length > 0
    ? config.evaluation.stacks
    : [{ name: 'default', dir: '.', config: 'tathya.config.yaml', baseUrl: config.baseUrl, coverage: 'none' as const, faults: true }];
  return only ? stacks.filter((stack) => stack.name === only) : stacks;
}

async function runStack(stack: StackConfig, rootConfig: TathyaConfig, options: EvalOptions) {
  const originalCwd = cwd();
  const originalTathyaConfig = process.env.TATHYA_CONFIG;
  chdir(resolve(originalCwd, stack.dir));
  // Point the spawned Playwright runs (root playwright.config.ts + global setup read this) at the
  // stack's config so baseURL, roles, and storage states match the stack under evaluation.
  process.env.TATHYA_CONFIG = stack.config;
  try {
    const config = await loadConfig(stack.config);
    const repeat = options.repeat ?? rootConfig.evaluation.repeat;
    const collectCoverage = options.coverage !== false && stack.coverage !== 'none';

    if (collectCoverage) await control(stack.baseUrl, 'POST', '/__testing/coverage/reset');

    const crawlMs = await timed(() => runCrawl(config));
    const roleNames = config.auth.roles.map((role) => role.name);
    let cases: ReturnType<typeof mapTestCases> = [];
    const generateMs = await timed(async () => {
      const crawls = await loadCrawls('crawl', roleNames);
      const matrix = buildAccessMatrix(crawls);
      cases = mapTestCases(crawls, matrix, config);
      await emit(cases, config);
    });
    const crawls = await loadCrawls('crawl', roleNames);
    const matrix = buildAccessMatrix(crawls);
    const manifest = buildManifest(cases);

    const runs: SuiteRun[] = [];
    const executeMs: number[] = [];
    for (let i = 0; i < repeat; i += 1) {
      const start = Date.now();
      runs.push(await runPlaywrightJson({ cwd: '.' }));
      executeMs.push(Date.now() - start);
    }

    const baselineRuns = options.baseline !== false ? await runBaseline(config, repeat) : [];
    const baselineStatic = await analyzeBaselineDir(config.evaluation.baselineDir);
    const sutCoverage = collectCoverage ? await fetchCoverage(stack.baseUrl) : null;
    // Skip fault injection for external stacks (stack.faults === false) or when disabled by flag.
    const runFaultsEnabled = stack.faults !== false && options.faults !== false && rootConfig.evaluation.faults.enabled;
    const faultRuns = runFaultsEnabled ? await runFaults(stack, rootConfig, config, manifest) : [];
    const baselineFaultRuns = runFaultsEnabled ? await runBaselineFaults(stack, rootConfig, config) : [];

    const input: MetricsInput = {
      config, manifest, crawls, matrix, runs, baselineRuns, baselineStatic,
      faultRuns, baselineFaultRuns, sutCoverage,
      timings: { crawlMs, generateMs, executeMs },
      manualBaselineSecPerCase: rootConfig.evaluation.manualBaselineSecPerCase,
    };
    return computeMetrics(input);
  } finally {
    if (originalTathyaConfig === undefined) delete process.env.TATHYA_CONFIG;
    else process.env.TATHYA_CONFIG = originalTathyaConfig;
    chdir(originalCwd);
  }
}

async function runBaseline(config: TathyaConfig, repeat: number): Promise<SuiteRun[]> {
  const dir = config.evaluation.baselineDir;
  if (!(await hasSpecs(dir))) return [];
  // If the baseline dir ships its own playwright.config.ts, use it so the
  // public suites run under their own setup (no role storageState, correct baseURL).
  const standaloneConfig = join(dir, 'playwright.config.ts');
  const hasConfig = await access(standaloneConfig).then(() => true).catch(() => false);
  const runs: SuiteRun[] = [];
  for (let i = 0; i < repeat; i += 1) {
    if (hasConfig) {
      runs.push(await runPlaywrightJson({ cwd: '.', config: standaloneConfig }));
    } else {
      runs.push(await runPlaywrightJson({ cwd: '.', paths: [dir] }));
    }
  }
  return runs;
}

/**
 * Run the baseline suite once under each fault activation to produce a baseline mutation score.
 * A fault is killed when any baseline test fails while the fault is active.
 * Localization accuracy is not computed (baseline titles don't map to the fault catalogue).
 */
async function runBaselineFaults(stack: StackConfig, rootConfig: TathyaConfig, config: TathyaConfig): Promise<FaultRun[]> {
  const dir = config.evaluation.baselineDir;
  if (!(await hasSpecs(dir))) return [];
  const faults = faultsForClasses(rootConfig.evaluation.faults.classes);
  const standaloneConfig = join(dir, 'playwright.config.ts');
  const hasConfig = await access(standaloneConfig).then(() => true).catch(() => false);
  const faultRuns: FaultRun[] = [];
  for (const fault of faults) {
    const set = await control(stack.baseUrl, 'POST', '/__testing/fault', { id: fault.id });
    if (!set) {
      console.warn(`[eval] could not activate fault ${fault.id} for baseline; skipping`);
      continue;
    }
    const suite = hasConfig
      ? await runPlaywrightJson({ cwd: '.', config: standaloneConfig })
      : await runPlaywrightJson({ cwd: '.', paths: [dir] });
    faultRuns.push({ id: fault.id, faultClass: fault.faultClass, outcomes: suite.outcomes });
  }
  await control(stack.baseUrl, 'POST', '/__testing/fault/clear');
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

async function runFaults(stack: StackConfig, rootConfig: TathyaConfig, config: TathyaConfig, manifest: ReturnType<typeof buildManifest>): Promise<FaultRun[]> {
  const byTitle = new Map(manifest.map((entry) => [entry.title, entry] as const));
  const faults = faultsForClasses(rootConfig.evaluation.faults.classes);
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
      faultRuns.push({ id: fault.id, faultClass: fault.faultClass, outcomes: [] });
      continue;
    }
    const set = await control(stack.baseUrl, 'POST', '/__testing/fault', { id: fault.id });
    if (!set) {
      console.warn(`[eval] could not activate fault ${fault.id}; skipping`);
      continue;
    }
    const grep = relevantEntries.map((entry) => escapeRegExp(entry.title)).join('|');
    const suite = await runPlaywrightJson({ cwd: '.', projects, grep });
    const relevant = suite.outcomes.filter((outcome) => {
      const entry = byTitle.get(outcome.title);
      return entry ? fault.relevant(entry) : false;
    });
    faultRuns.push({ id: fault.id, faultClass: fault.faultClass, outcomes: relevant });
  }
  await control(stack.baseUrl, 'POST', '/__testing/fault/clear');
  return faultRuns;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchCoverage(baseUrl: string): Promise<SutCoverage | null> {
  try {
    const response = await fetch(new URL('/__testing/coverage', baseUrl));
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

async function writeReports(outDir: string, reports: StackReport[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(renderReportJson(reports), null, 2)}\n`);
  await writeFile(join(outDir, 'report.md'), renderReportMarkdown(reports));
}
