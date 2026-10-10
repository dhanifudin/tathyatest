import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { ensureCrawls, loadCrawls, runCrawl } from './crawl.js';
import { runInit } from './init.js';
import { buildAccessMatrix } from './rbac.js';
import { mapTestCases } from './mapper.js';
import { emit } from './emit/index.js';
import { runEvaluation } from './eval/runner.js';

const program = new Command();

program
  .name('tt')
  .description('TathyaTest — generate and run Playwright functional tests from a crawl of your web app')
  .version('0.1.0')
  .enablePositionalOptions()
  .showHelpAfterError('(run `tt --help` for the command list)')
  .action(() => program.help());

program.option('-c, --config <path>', 'path to the tathya config YAML', 'tathya.config.yaml');

function configPath(): string {
  return program.opts<{ config: string }>().config;
}

function loadCliConfig(): ReturnType<typeof loadConfig> {
  return loadConfig(configPath());
}

program.command('init').description('create a project directory with a tathya.config.yaml').action(async () => {
  await runInit();
});

program.command('crawl').description('crawl the app once per role → crawl/<role>.json').action(async () => {
  const config = await loadCliConfig();
  await runCrawl(config);
});

program.command('generate')
  .description('generate Playwright specs (re-crawls first when the crawl is missing or older than the config)')
  .option('--fresh', 'crawl again even if the cached crawl looks current')
  .action(async (options: { fresh?: boolean }) => {
    const config = await loadCliConfig();
    await ensureCrawls(config, { configPath: configPath(), force: options.fresh });
    await generateFromCrawls(config);
  });

program.command('run')
  .description('run the generated specs; extra arguments go to `playwright test` (e.g. tt run --project admin-chromium --grep @auth)')
  .argument('[playwrightArgs...]', 'arguments forwarded to playwright test')
  .passThroughOptions()
  .allowUnknownOption()
  .action(async (playwrightArgs: string[]) => {
    await runPlaywright('test', playwrightArgs);
  });

program.command('report').description('open the HTML report of the last run').action(async () => {
  await runPlaywright('show-report', []);
});

program.command('all')
  .description('crawl, generate, and run')
  .option('--fresh', 'crawl again even if the cached crawl looks current')
  .action(async (options: { fresh?: boolean }) => {
    const config = await loadCliConfig();
    await ensureCrawls(config, { configPath: configPath(), crawlRunner: runCrawl, force: options.fresh });
    await generateFromCrawls(config);
    await runPlaywright('test', []);
  });

program.command('eval')
  .description('metric-based evaluation of this config → metrics/report.{json,md} (use --all-stacks for the cross-stack study)')
  .option('--stack <name>', 'evaluate one entry of evaluation.stacks')
  .option('--all-stacks', 'evaluate every entry of evaluation.stacks (skips unreachable ones)')
  .option('--repeat <n>', 'override evaluation.repeat', (value) => Number.parseInt(value, 10))
  .option('--no-faults', 'skip fault-injection effectiveness')
  .option('--no-coverage', 'skip SUT code-coverage collection')
  .option('--no-baseline', 'skip the manual baseline comparison')
  .action(async (options: { stack?: string; allStacks?: boolean; repeat?: number; faults?: boolean; coverage?: boolean; baseline?: boolean }) => {
    const config = await loadCliConfig();
    await runEvaluation(config, {
      stack: options.stack ?? null,
      allStacks: options.allStacks ?? false,
      configPath: configPath(),
      repeat: options.repeat ?? null,
      faults: options.faults,
      coverage: options.coverage,
      baseline: options.baseline,
    });
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function runPlaywright(subcommand: 'test' | 'show-report', args: string[]): Promise<void> {
  const hasReporter = args.some((arg) => arg === '--reporter' || arg.startsWith('--reporter='));
  const fullArgs = subcommand === 'test' && !hasReporter ? [subcommand, '--reporter=list', ...args] : [subcommand, ...args];
  return new Promise((resolve, reject) => {
    resolvePlaywrightBinary()
      .then((bin) => {
        const child = spawn(bin, fullArgs, {
          stdio: 'inherit',
          // Root playwright.config.ts + global setup honour TATHYA_CONFIG (see --config option).
          env: { ...withPlaywrightNodePath(), TATHYA_CONFIG: configPath() },
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`playwright exited with code ${code ?? 'unknown'}`));
        });
      })
      .catch(reject);
  });
}

async function resolvePlaywrightBinary(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Prefer the project-local installation — see eval/playwright.ts resolvePlaywrightBinary.
  const candidates = [
    resolve(process.cwd(), 'node_modules', '.bin', 'playwright'),
    resolve(here, '..', 'node_modules', '.bin', 'playwright'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next conventional location.
    }
  }

  throw new Error('Could not find the installed Playwright binary. Re-run `make install`.');
}

function withPlaywrightNodePath(): NodeJS.ProcessEnv {
  const here = dirname(fileURLToPath(import.meta.url));
  const playwrightNodeModules = resolve(here, '..', 'node_modules');
  const currentNodePath = process.env.NODE_PATH ?? '';
  const nodePath = [playwrightNodeModules, currentNodePath].filter(Boolean).join(process.platform === 'win32' ? ';' : ':');
  return {
    ...process.env,
    NODE_PATH: nodePath,
  };
}

async function generateFromCrawls(config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  const crawls = await loadCrawls('crawl', config.auth.roles.map((role) => role.name));
  const matrix = buildAccessMatrix(crawls);
  await emit(mapTestCases(crawls, matrix, config), config);
}
