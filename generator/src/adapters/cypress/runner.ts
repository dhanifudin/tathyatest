import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { TathyaConfig } from '../../config.js';
import type { SuiteRun, TestOutcome, TestStatus } from '../../eval/types.js';
import { log } from '../../logger.js';
import { countPattern } from '../../util/text.js';
import type { RunMode, SpecAnalysis, TestRunner } from '../types.js';

/**
 * Cypress has no projects: one invocation per (role × browser) stands in for Playwright's
 * `<role>-<browser>` projects, with the role passed as `--expose role=<name>` (the specs' role gate
 * reads it) and tag filters through @cypress/grep.
 */
export const cypressRunner: TestRunner = {
  async run({ configPath, config, args, mode }) {
    const bin = cypressBin(process.cwd());
    const failed: string[] = [];
    for (const { role, browser } of runsOf(config)) {
      log.info(`[cypress] ${role}-${browser}`);
      const code = await spawnInherit(bin, [...cypressRunArgs({ role, browser, mode }), ...args], { ...childEnv(), TATHYA_CONFIG: configPath });
      if (code !== 0) failed.push(`${role}-${browser}`);
    }
    if (failed.length > 0) throw new Error(`cypress failed for ${failed.join(', ')}`);
  },
  async runJson(config, options) {
    const cypress = loadCypress(options.cwd);
    const outcomes: TestOutcome[] = [];
    for (const { role, browser } of runsOf(config, options.browsers)) {
      // Baselines without their own cypress.config.ts run under the root config, retargeted.
      const restoreTestDir = setEnv('TATHYA_TESTDIR', options.testDir && !options.configFile ? options.testDir : undefined);
      const restoreElectron = setEnv('ELECTRON_RUN_AS_NODE', undefined);
      try {
        const result = await cypress.run({
          project: resolve(options.cwd),
          configFile: options.configFile,
          browser,
          quiet: true,
          config: {
            // Flake metrics need raw outcomes, so no retries; artefacts are not needed for metrics.
            retries: 0,
            video: false,
            screenshotOnRunFailure: false,
            expose: { role, ...(options.titles ? { grep: grepTitles(options.titles), grepFilterSpecs: true } : {}) },
          },
        });
        outcomes.push(...parseCypressResults(result, role, browser).outcomes);
      } finally {
        restoreElectron();
        restoreTestDir();
      }
    }
    return { outcomes };
  },
  async showReport() {
    log.info('Cypress writes no HTML report; the console summary of `tt run --framework cypress` is the report.');
  },
  specFile: /\.cy\.(t|j)s$/,
  foreignSpecFile: /\.(spec|test)\.m?[tj]s$/,
  configFileName: 'cypress.config.ts',
  staticAnalysis: analyzeCypressSource,
};

/** `cypress run` arguments for one (role, browser) pair, with the read/write tag filter. */
export function cypressRunArgs({ role, browser, mode }: { role: string; browser: string; mode?: RunMode }): string[] {
  const grepTags = mode === 'read-only' ? ',grepTags=-@write' : mode === 'write-only' ? ',grepTags=-@read' : '';
  return ['run', '--browser', browser, '--expose', `role=${role}${grepTags}`];
}

function runsOf(config: Pick<TathyaConfig, 'auth' | 'cypress'>, browsers?: string[]): { role: string; browser: string }[] {
  const selected = browsers ?? config.cypress.browsers;
  return config.auth.roles.flatMap((role) => selected.map((browser) => ({ role: role.name, browser })));
}

/**
 * @cypress/grep's title filter: substrings separated by `;` (OR). Leaf titles are globally unique,
 * so each selects its own test; `tt eval` keeps only the relevant outcomes anyway.
 */
// shortcut: a title containing ";" would split into two substrings; none of the generated titles has one.
export function grepTitles(titles: string[]): string {
  return titles.join('; ');
}

// --- Pure parser: Cypress Module API result -> normalized SuiteRun ------------------------------

type RawTest = { title?: string[]; state?: string; duration?: number };
type RawRun = { tests?: RawTest[] };
type RawResult = { status?: string; message?: string; runs?: RawRun[] };

/**
 * One outcome per test of a (role, browser) run, keyed `<role>-<browser>` like a Playwright
 * project. Tests gated to another role (`this.skip()` in the role group) and grep-filtered tests
 * are `pending` and come back as `skipped`, never omitted.
 */
export function parseCypressResults(result: unknown, role: string, browser: string): SuiteRun {
  const raw = (result ?? {}) as RawResult;
  if (raw.status === 'failed') throw new Error(`cypress could not run ${role}-${browser}: ${raw.message ?? 'unknown error'} (is the browser installed? \`npx cypress info\` lists them)`);
  const project = `${role}-${browser}`;
  const outcomes = (raw.runs ?? []).flatMap((run) => (run.tests ?? []).map((test): TestOutcome => ({
    title: test.title?.at(-1) ?? '',
    project,
    status: normalizeStatus(test.state),
    durationMs: test.duration ?? 0,
  })));
  return { outcomes };
}

function normalizeStatus(state: string | undefined): TestStatus {
  if (state === 'passed') return 'passed';
  if (state === 'pending' || state === 'skipped') return 'skipped';
  return 'failed';
}

// --- Static analysis of Cypress spec sources (manual baselines) ---------------------------------

/** Source-level counts for a hand-written Cypress spec (a proxy, like the Playwright analysis). */
export function analyzeCypressSource(src: string): SpecAnalysis {
  const tests = countPattern(src, /\bit\s*\(/g);
  // A call to an `expect*` / `assert*` helper is one assertion at its call site.
  const assertions = countPattern(src, /\.should\s*\(/g) + countPattern(src, /\bexpect\s*\(/g)
    + countPattern(src, /\b(expect|assert)[A-Z_]\w*\s*\(/g);
  const locatorCounts: Record<string, number> = {
    testid: countPattern(src, /\[data-(testid|test|cy)=/g) + countPattern(src, /\bbyTestId\s*\(/g),
    role: countPattern(src, /\b(find(All)?ByRole|byRole)\s*\(/g),
    label: countPattern(src, /\b(find(All)?ByLabelText|byLabel)\s*\(/g),
    placeholder: countPattern(src, /\b(find(All)?ByPlaceholderText|byPlaceholder)\s*\(/g),
    id: countPattern(src, /\bcy\.get\s*\(\s*['"`]#[^'"`]/g) + countPattern(src, /\bbyId\s*\(/g),
    name: countPattern(src, /\[name=/g) + countPattern(src, /\bbyName\s*\(/g),
    css: 0,
  };
  // Any cy.get()/byCss() not accounted for by the named strategies is counted as CSS.
  const totalGets = countPattern(src, /\bcy\.get\s*\(\s*['"`][^@]/g) + countPattern(src, /\bbyCss\s*\(/g);
  const named = locatorCounts.testid + locatorCounts.id + countPattern(src, /\[name=/g);
  locatorCounts.css = Math.max(0, totalGets - named);
  return { tests, assertions, locatorCounts };
}

// --- Process plumbing ----------------------------------------------------------------------------

type CypressModule = { run(options: Record<string, unknown>): Promise<unknown> };

/** The project's own Cypress installation (the specs and cypress.config.ts resolve it too). */
function loadCypress(cwd: string): CypressModule {
  try {
    return createRequire(join(resolve(cwd), 'package.json'))('cypress') as CypressModule;
  } catch {
    throw new Error('Could not find the installed Cypress package. Install it with `npm install --save-dev cypress @cypress/grep @testing-library/dom` and run `npx cypress install`.');
  }
}

function cypressBin(cwd: string): string {
  try {
    return join(dirname(createRequire(join(resolve(cwd), 'package.json')).resolve('cypress/package.json')), 'bin', 'cypress');
  } catch {
    throw new Error('Could not find the installed Cypress package. Install it with `npm install --save-dev cypress @cypress/grep @testing-library/dom` and run `npx cypress install`.');
  }
}

/** Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which breaks Cypress's own Electron. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function setEnv(name: string, value: string | undefined): () => void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  };
}

function spawnInherit(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [bin, ...args], { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => resolveRun(code ?? 1));
  });
}
