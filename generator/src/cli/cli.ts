import { Command, Option } from 'commander';
import { adapterFor } from '../adapters/registry.js';
import { FRAMEWORKS, type Framework, type RunMode } from '../adapters/types.js';
import { loadConfig, withFramework } from '../config.js';
import { ensureCrawls, runCrawl } from '../crawl/crawl.js';
import { runInit } from './init.js';
import { generateSuite } from '../pipeline.js';
import { runEvaluation } from '../eval/runner.js';
import { DEFAULT_PATHS } from '../util/paths.js';

type Config = Awaited<ReturnType<typeof loadConfig>>;
type FrameworkOption = { framework?: Framework };

/** `--framework playwright|cypress`: which adapter emits and runs the suite (default: `output.framework`). */
function frameworkOption(): Option {
  return new Option('--framework <framework>', 'test framework of the generated suite (overrides output.framework)').choices(FRAMEWORKS);
}

/** The `tt` command tree. `main.ts` parses it; tests inspect it. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('tt')
    .description(`TathyaTest — generate and run functional tests (${FRAMEWORKS.join(' or ')}) from a crawl of your web app`)
    .version('0.1.0')
    .enablePositionalOptions()
    .showHelpAfterError('(run `tt --help` for the command list)')
    .action(() => program.help());

  program.option('-c, --config <path>', 'path to the tathya config YAML', DEFAULT_PATHS.configFile);

  const configPath = (): string => program.opts<{ config: string }>().config;
  const loadCliConfig = async (framework?: Framework): Promise<Config> => withFramework(await loadConfig(configPath()), framework);

  program.command('init').description('create a project directory with a tathya.config.yaml').action(async () => {
    await runInit();
  });

  program.command('crawl').description('crawl the app once per role → crawl/<role>.json').action(async () => {
    const config = await loadCliConfig();
    await runCrawl(config);
  });

  program.command('generate')
    .description('generate specs for the selected framework (re-crawls first when the crawl is missing or older than the config)')
    .addOption(frameworkOption())
    .option('--fresh', 'crawl again even if the cached crawl looks current')
    .option('--read-only', 'generate only non-mutating checks (safe against staging/production); same as mode: read-only')
    .action(async (options: FrameworkOption & { fresh?: boolean; readOnly?: boolean }) => {
      const config = withMode(await loadCliConfig(options.framework), options.readOnly);
      await ensureCrawls(config, { force: options.fresh });
      await generateSuite(config);
    });

  program.command('run')
    .description('run the generated specs; extra arguments go to the framework CLI (e.g. tt run --project admin-chromium --grep @auth, or with --framework cypress: tt run --framework cypress --spec "tests/generated/rbac/*")')
    .argument('[frameworkArgs...]', 'arguments forwarded to `playwright test` or `cypress run`')
    .addOption(frameworkOption())
    .option('--read-only', 'run only tests tagged @read (skips everything that writes)')
    .option('--write-only', 'run only tests tagged @write')
    .passThroughOptions()
    .allowUnknownOption()
    .action(async (frameworkArgs: string[], options: FrameworkOption & { readOnly?: boolean; writeOnly?: boolean }) => {
      const config = await loadCliConfig(options.framework);
      await adapterFor(config.output.framework).runner.run({ configPath: configPath(), config, args: frameworkArgs, mode: runMode(options) });
    });

  program.command('report')
    .description('open the HTML report of the last run')
    .addOption(frameworkOption())
    .action(async (options: FrameworkOption) => {
      const config = await loadCliConfig(options.framework);
      await adapterFor(config.output.framework).runner.showReport(configPath());
    });

  program.command('all')
    .description('crawl, generate, and run')
    .addOption(frameworkOption())
    .option('--fresh', 'crawl again even if the cached crawl looks current')
    .option('--read-only', 'generate and run only non-mutating checks (safe against staging/production)')
    .action(async (options: FrameworkOption & { fresh?: boolean; readOnly?: boolean }) => {
      const config = withMode(await loadCliConfig(options.framework), options.readOnly);
      await ensureCrawls(config, { crawlRunner: runCrawl, force: options.fresh });
      await generateSuite(config);
      await adapterFor(config.output.framework).runner.run({ configPath: configPath(), config, args: [] });
    });

  program.command('eval')
    .description('metric-based evaluation of this config → metrics/report.{json,md} (use --all-stacks for the cross-stack study)')
    .addOption(frameworkOption())
    .option('--stack <name>', 'evaluate one entry of evaluation.stacks')
    .option('--all-stacks', 'evaluate every entry of evaluation.stacks (skips unreachable ones)')
    .option('--repeat <n>', 'override evaluation.repeat', (value) => Number.parseInt(value, 10))
    .option('--no-faults', 'skip fault-injection effectiveness')
    .option('--no-coverage', 'skip SUT code-coverage collection')
    .option('--no-baseline', 'skip the manual baseline comparison')
    .action(async (options: FrameworkOption & { stack?: string; allStacks?: boolean; repeat?: number; faults?: boolean; coverage?: boolean; baseline?: boolean }) => {
      const config = await loadCliConfig(options.framework);
      await runEvaluation(config, {
        stack: options.stack ?? null,
        allStacks: options.allStacks ?? false,
        configPath: configPath(),
        repeat: options.repeat ?? null,
        faults: options.faults,
        coverage: options.coverage,
        baseline: options.baseline,
        framework: options.framework,
      });
    });

  return program;
}

function withMode(config: Config, readOnly: boolean | undefined): Config {
  return readOnly ? { ...config, mode: 'read-only' as const } : config;
}

export function runMode(options: { readOnly?: boolean; writeOnly?: boolean }): RunMode | undefined {
  if (options.readOnly && options.writeOnly) throw new Error('--read-only and --write-only exclude each other');
  if (options.readOnly) return 'read-only';
  if (options.writeOnly) return 'write-only';
  return undefined;
}
