import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import YAML from 'yaml';

const coverageSchema = z.enum(['positive', 'negative', 'edge', 'all']);
const engineSchema = z.enum(['static', 'rendered']);
const languageSchema = z.enum(['ts', 'js']);

export const configSchema = z.object({
  baseUrl: z.string().url(),
  extractor: z.object({ engine: engineSchema }),
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
    usernameField: z.string(),
    passwordField: z.string(),
    roles: z.array(z.object({
      name: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
    })).min(1),
  }),
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
  }).default({ fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [] }),
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
