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

program.name('tt').description('TathyaTest CLI').version('0.1.0');

program.option('-c, --config <path>', 'path to the tathya config YAML', 'tathya.config.yaml');

function loadCliConfig(): ReturnType<typeof loadConfig> {
  return loadConfig(program.opts<{ config: string }>().config);
}

program.command('init').description('write tathya.config.yaml').action(async () => {
  await runInit();
});

program.command('crawl').description('crawl configured app once per role').action(async () => {
  const config = await loadCliConfig();
  await runCrawl(config);
});

program.command('generate').description('generate Playwright specs').action(async () => {
  const config = await loadCliConfig();
  await ensureCrawls(config);
  await generateFromCrawls(config);
});

program.command('run').description('run generated Playwright specs').action(async () => {
  await runPlaywright();
});

program.command('all').description('crawl, generate, and run').action(async () => {
  const config = await loadCliConfig();
  await ensureCrawls(config, { crawlRunner: runCrawl });
  await generateFromCrawls(config);
  await runPlaywright();
});

program.command('eval')
  .description('run the metric-based evaluation and write metrics/report.{json,md}')
  .option('--stack <name>', 'only evaluate the named stack')
  .option('--repeat <n>', 'override evaluation.repeat', (value) => Number.parseInt(value, 10))
  .option('--no-faults', 'skip fault-injection effectiveness')
  .option('--no-coverage', 'skip SUT code-coverage collection')
  .option('--no-baseline', 'skip the manual baseline comparison')
  .action(async (options: { stack?: string; repeat?: number; faults?: boolean; coverage?: boolean; baseline?: boolean }) => {
    const config = await loadCliConfig();
    await runEvaluation(config, {
      stack: options.stack ?? null,
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

function runPlaywright(): Promise<void> {
  return new Promise((resolve, reject) => {
    resolvePlaywrightBinary()
      .then((bin) => {
        const child = spawn(bin, ['test', '--reporter=list'], {
          stdio: 'inherit',
          // Root playwright.config.ts + global setup honour TATHYA_CONFIG (see --config option).
          env: { ...withPlaywrightNodePath(), TATHYA_CONFIG: program.opts<{ config: string }>().config },
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
