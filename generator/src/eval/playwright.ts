import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SuiteRun, TestOutcome, TestStatus } from '../metrics.js';
import { resolvePlaywrightBinary, withPlaywrightNodePath } from '../util/playwright-bin.js';

export type RunOptions = {
  cwd?: string;
  /** Playwright project names; the CLI accepts repeated --project flags. */
  projects?: string[] | null;
  grep?: string | null;
  paths?: string[];
  config?: string | null;
  /** Extra env vars for the Playwright process (e.g. TATHYA_TESTDIR for baseline runs). */
  env?: Record<string, string>;
};

// --- Pure parser: Playwright JSON reporter output -> normalized SuiteRun -----------------------

type RawResult = { status?: string; duration?: number };
type RawTest = { projectName?: string; projectId?: string; results?: RawResult[] };
type RawSpec = { title?: string; tests?: RawTest[] };
type RawSuite = { title?: string; specs?: RawSpec[]; suites?: RawSuite[] };
type RawReport = { suites?: RawSuite[] };

export function parsePlaywrightJson(report: unknown): SuiteRun {
  const outcomes: TestOutcome[] = [];
  const root = (report ?? {}) as RawReport;
  walkSuites(root.suites ?? [], outcomes);
  return { outcomes };
}

function walkSuites(suites: RawSuite[], outcomes: TestOutcome[]): void {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      const title = spec.title ?? '';
      for (const test of spec.tests ?? []) {
        const project = test.projectName ?? test.projectId ?? 'default';
        const last = (test.results ?? []).at(-1);
        outcomes.push({
          title,
          project,
          status: normalizeStatus(last?.status),
          durationMs: last?.duration ?? 0,
        });
      }
    }
    walkSuites(suite.suites ?? [], outcomes);
  }
}

function normalizeStatus(status: string | undefined): TestStatus {
  if (status === 'passed' || status === 'expected') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed'; // failed, timedOut, interrupted, unexpected, flaky-final-fail
}

// --- Impure runner: spawn Playwright and parse its JSON ----------------------------------------

export async function runPlaywrightJson(options: RunOptions = {}): Promise<SuiteRun> {
  const cwd = options.cwd ?? process.cwd();
  const bin = await resolvePlaywrightBinary(cwd);
  const dir = await mkdtemp(join(tmpdir(), 'tt-pw-'));
  const outputFile = join(dir, 'report.json');
  try {
    const args = ['test', '--reporter=json'];
    if (options.config) args.push(`--config=${options.config}`);
    for (const project of options.projects ?? []) args.push(`--project=${project}`);
    if (options.grep) args.push(`--grep=${options.grep}`);
    if (options.paths?.length) args.push(...options.paths);
    await spawnPlaywright(bin, args, cwd, outputFile, options.env);
    const raw = await readFile(outputFile, 'utf8');
    return parsePlaywrightJson(JSON.parse(raw));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function spawnPlaywright(bin: string, args: string[], cwd: string, jsonOutput: string, extraEnv?: Record<string, string>): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...withPlaywrightNodePath(cwd), PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutput, ...extraEnv },
    });
    child.on('error', reject);
    // Playwright exits non-zero when tests fail; that is expected during fault injection. We rely
    // on the JSON report for status, so resolve regardless of exit code (reject only on no report).
    child.on('exit', () => resolveRun());
  });
}

