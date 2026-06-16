import { access, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { renderedCrawl } from './extract/rendered.js';
import type { TathyaConfig } from './config.js';

export type LocatorStrategy = 'testid' | 'role' | 'label' | 'placeholder' | 'id' | 'name' | 'css';
export type CrudOp = 'create' | 'update' | 'delete' | 'unknown';
export type Engine = 'static' | 'rendered';

export type Locator = { strategy: LocatorStrategy; value: string };
export type FieldConstraints = {
  minlength: number | null;
  maxlength: number | null;
  min: string | null;
  max: string | null;
  step: string | null;
  pattern: string | null;
  inputmode: string | null;
  accept: string | null;
};
export type FieldOption = { value: string; label: string };
export type Field = {
  name: string;
  type: string;
  label: string | null;
  required: boolean;
  constraints: FieldConstraints;
  options: FieldOption[] | null;
  nameHints: string[];
  locator: Locator;
};
export type Form = {
  action: string;
  method: 'GET' | 'POST';
  crudOp: CrudOp;
  noValidate: boolean;
  fields: Field[];
  submit: { text: string | null; locator: Locator };
};
export type PageModel = {
  url: string;
  title: string;
  forms: Form[];
  links: { href: string; text: string; locator: Locator }[];
  buttons: { text: string; locator: Locator }[];
  tables: { headers: string[]; rowCount: number }[];
};
export type CrawlOutput = {
  baseUrl: string;
  engine: Engine;
  role: string;
  crawledAt: string;
  pages: PageModel[];
};

const locatorSchema = z.object({
  strategy: z.enum(['testid', 'role', 'label', 'placeholder', 'id', 'name', 'css']),
  value: z.string(),
});
const constraintsSchema = z.object({
  minlength: z.number().nullable(),
  maxlength: z.number().nullable(),
  min: z.string().nullable(),
  max: z.string().nullable(),
  step: z.string().nullable(),
  pattern: z.string().nullable(),
  inputmode: z.string().nullable(),
  accept: z.string().nullable(),
});
export const crawlOutputSchema: z.ZodType<CrawlOutput> = z.object({
  baseUrl: z.string(),
  engine: z.enum(['static', 'rendered']),
  role: z.string(),
  crawledAt: z.string(),
  pages: z.array(z.object({
    url: z.string(),
    title: z.string(),
    forms: z.array(z.object({
      action: z.string(),
      method: z.enum(['GET', 'POST']),
      crudOp: z.enum(['create', 'update', 'delete', 'unknown']),
      noValidate: z.boolean(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        label: z.string().nullable(),
        required: z.boolean(),
        constraints: constraintsSchema,
        options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
        nameHints: z.array(z.string()),
        locator: locatorSchema,
      })),
      submit: z.object({ text: z.string().nullable(), locator: locatorSchema }),
    })),
    links: z.array(z.object({ href: z.string(), text: z.string(), locator: locatorSchema })),
    buttons: z.array(z.object({ text: z.string(), locator: locatorSchema })),
    tables: z.array(z.object({ headers: z.array(z.string()), rowCount: z.number() })),
  })),
});

export async function loadCrawls(dir = 'crawl'): Promise<CrawlOutput[]> {
  const entries = await readdir(dir);
  const crawls = await Promise.all(entries.filter((name) => name.endsWith('.json')).map(async (name) => {
    const parsed = JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
    return crawlOutputSchema.parse(parsed);
  }));
  return crawls.sort((a, b) => a.role.localeCompare(b.role));
}

export async function runCrawl(config: TathyaConfig): Promise<void> {
  await mkdir('crawl', { recursive: true });
  if (config.extractor.engine === 'rendered') {
    await renderedCrawl(config);
    return;
  }
  await runStaticCrawler();
}

export async function ensureCrawls(config: TathyaConfig, options: { crawlDir?: string; configPath?: string; crawlRunner?: (config: TathyaConfig) => Promise<void> } = {}): Promise<void> {
  const crawlDir = options.crawlDir ?? 'crawl';
  const configPath = options.configPath ?? 'tathya.config.yaml';
  const crawlRunner = options.crawlRunner ?? runCrawl;
  if (await shouldRefreshCrawls(config, crawlDir, configPath)) {
    await crawlRunner(config);
  }
}

export async function shouldRefreshCrawls(config: TathyaConfig, crawlDir = 'crawl', configPath = 'tathya.config.yaml'): Promise<boolean> {
  try {
    const configStat = await stat(configPath);
    for (const role of config.auth.roles) {
      const path = join(crawlDir, `${role.name}.json`);
      const crawlStat = await stat(path);
      if (crawlStat.mtimeMs < configStat.mtimeMs) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function runStaticCrawler(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), 'tt-crawler'),
    resolve(process.cwd(), 'crawler', 'tt-crawler'),
    resolve(here, '..', '..', 'tt-crawler'),
  ];
  const bin = await firstExisting(candidates);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin ?? 'tt-crawler', [], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`tt-crawler exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next conventional location.
    }
  }
  return null;
}
