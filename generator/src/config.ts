import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import YAML from 'yaml';
import { normalizeBaseUrl } from './login.js';

const coverageSchema = z.enum(['positive', 'negative', 'edge', 'all']);
const legacyEngineSchema = z.enum(['static', 'rendered']);
const languageSchema = z.enum(['ts', 'js']);

export const configSchema = z.object({
  baseUrl: z.preprocess((value) => (typeof value === 'string' ? normalizeBaseUrl(value) : value), z.string().url()),
  extractor: z.object({ engine: legacyEngineSchema.optional() }).optional(),
  output: z.object({
    dir: z.string().default('tests/generated'),
    language: languageSchema.default('ts'),
  }),
  coverage: coverageSchema.default('all'),
  oracle: z.object({
    errorSelector: z.string().default('.invalid-feedback, [role=alert], .text-red-600, x-input-error p'),
  }),
  auth: z.object({
    loginPath: z.string().startsWith('/'),
    roles: z.array(z.object({
      name: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
    })).min(1),
  }).strict(),
  crawl: z.object({
    maxDepth: z.number().int().positive().default(3),
    maxPages: z.number().int().positive().default(100),
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  }),
  data: z.object({
    fields: z.record(z.string()).default({}),
    defaults: z.record(z.string()).default({}),
    unique: z.array(z.string()).default([]),
    duplicates: z.record(z.string()).default({}),
    requiredFields: z.array(z.string()).default([]),
    confirmFields: z.array(z.string()).default([]),
    faker: z.object({
      locale: z.string().default('en'),
      seed: z.number().int().nullable().default(null),
    }).default({ locale: 'en', seed: null }),
  }).default({ fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [], faker: { locale: 'en', seed: null } }),
  evaluation: z.object({
    outDir: z.string().default('metrics'),
    repeat: z.number().int().positive().default(1),
    manualBaselineSecPerCase: z.number().positive().default(300),
    baselineDir: z.string().default('tests/manual'),
    faultProject: z.string().nullable().default(null),
    stacks: z.array(z.object({
      name: z.string().min(1),
      dir: z.string().default('.'),
      config: z.string().default('tathya.config.yaml'),
      baseUrl: z.preprocess((value) => (typeof value === 'string' ? normalizeBaseUrl(value) : value), z.string().url()),
      coverage: z.enum(['pcov', 'xdebug', 'none']).default('pcov'),
      faults: z.boolean().default(true),
    })).default([]),
    faults: z.object({
      enabled: z.boolean().default(true),
      classes: z.array(z.enum(['validation', 'authz', 'crud', 'pagination', 'auth'])).default(['validation', 'authz', 'crud', 'pagination', 'auth']),
    }).default({ enabled: true, classes: ['validation', 'authz', 'crud', 'pagination', 'auth'] }),
  }).default({
    outDir: 'metrics',
    repeat: 1,
    manualBaselineSecPerCase: 300,
    baselineDir: 'tests/manual',
    faultProject: null,
    stacks: [],
    faults: { enabled: true, classes: ['validation', 'authz', 'crud', 'pagination', 'auth'] },
  }),
});

export type TathyaConfig = z.infer<typeof configSchema>;
export type Coverage = TathyaConfig['coverage'];

export async function loadConfig(path = 'tathya.config.yaml'): Promise<TathyaConfig> {
  const raw = await readFile(path, 'utf8');
  return configSchema.parse(YAML.parse(raw));
}

export function shouldIncludeCoverage(configured: Coverage, tier: 'positive' | 'negative' | 'edge'): boolean {
  return configured === 'all' || configured === tier || tier === 'positive';
}
