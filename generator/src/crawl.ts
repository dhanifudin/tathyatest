import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
/**
 * A non-form interactive control extracted from the page. Currently scoped to `select`
 * elements that live outside any `<form>` (e.g. sort dropdowns in React SPAs). The
 * `buttons` array records all button-like controls regardless of whether they are inside
 * a form (form-submit buttons are still deduplicated by the mapper via formSubmitLocators).
 */
export type Control = {
  kind: 'select';
  text: string | null;
  options: FieldOption[] | null;
  locator: Locator;
};
export type PageModel = {
  url: string;
  title: string;
  forms: Form[];
  /** `visible` reflects CSS visibility at crawl viewport (responsive duplicates: a mobile
   * paginator link is present but hidden on desktop). Optional for back-compat; absent
   * means unknown and is treated as visible. */
  links: { href: string; text: string; locator: Locator; visible?: boolean }[];
  /** Button-like controls: <button>, <input type=button|submit|reset|image>, [role=button|menuitem|tab]. */
  buttons: { text: string; locator: Locator; visible?: boolean }[];
  tables: { headers: string[]; rowCount: number }[];
  /** Non-form interactive controls (orphan selects, etc.). Optional for back-compat with old crawl
   * JSON; zod `.default([])` ensures parsed output always has it. Runtime code must use `?? []`. */
  controls?: Control[];
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
// ZodType<Output, Def, Input=Output> — we use `unknown` as Input so that `.default([])`
// transforms (which widen the accepted input to allow `undefined` fields) satisfy the
// type-checker without requiring `any`.
export const crawlOutputSchema: z.ZodType<CrawlOutput, z.ZodTypeDef, unknown> = z.object({
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
    links: z.array(z.object({ href: z.string(), text: z.string(), locator: locatorSchema, visible: z.boolean().optional() })),
    buttons: z.array(z.object({ text: z.string(), locator: locatorSchema, visible: z.boolean().optional() })),
    tables: z.array(z.object({ headers: z.array(z.string()), rowCount: z.number() })),
    controls: z.array(z.object({
      kind: z.literal('select'),
      text: z.string().nullable(),
      options: z.array(z.object({ value: z.string(), label: z.string() })).nullable(),
      locator: locatorSchema,
    })).default([]),
  })),
});

/**
 * Load crawl snapshots from `dir`. When `roles` is given, only `<role>.json` files for those
 * roles are read — this prevents cross-subject contamination when the crawl dir still holds
 * snapshots from a previously evaluated subject with different role names.
 */
export async function loadCrawls(dir = 'crawl', roles?: string[]): Promise<CrawlOutput[]> {
  const entries = await readdir(dir);
  const wanted = roles ? new Set(roles.map((role) => `${role}.json`)) : null;
  const crawls = await Promise.all(entries
    .filter((name) => name.endsWith('.json') && (wanted === null || wanted.has(name)))
    .map(async (name) => {
      const parsed = JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
      return crawlOutputSchema.parse(parsed);
    }));
  return crawls.sort((a, b) => a.role.localeCompare(b.role));
}

export async function runCrawl(config: TathyaConfig): Promise<void> {
  await mkdir('crawl', { recursive: true });
  // Drop snapshots from other subjects/roles so downstream loadCrawls never mixes subjects.
  const configuredRoles = new Set(config.auth.roles.map((role) => `${role.name}.json`));
  for (const entry of await readdir('crawl')) {
    if (entry.endsWith('.json') && !configuredRoles.has(entry)) await rm(join('crawl', entry));
  }
  await renderedCrawl(config);
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
