import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, intro, isCancel, outro, password, select, text } from '@clack/prompts';
import YAML from 'yaml';
import { normalizeBaseUrl } from './login.js';

type PromptValue = string | symbol;
type InitConfigInput = {
  baseUrl: string;
  loginPath: string;
  roles: Array<{ name: string; username: string; password: string }>;
  language: string;
  fakerLocale?: string;
  fakerSeed?: number | null;
};

function mustString(value: PromptValue, label: string): string {
  if (isCancel(value)) throw new Error(`${label} is required`);
  return value;
}

export function defaultRoleName(index: number): string {
  if (index === 0) return 'admin';
  if (index === 1) return 'user';
  return `role-${index + 1}`;
}

export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (slug.length === 0) throw new Error('Project name must contain at least one letter or number');
  return slug;
}

export function initProjectPaths(projectName: string, cwd = '.'): { projectDir: string; configPath: string; outputDir: string } {
  const projectDir = join(cwd, slugifyProjectName(projectName));
  return {
    projectDir,
    configPath: join(projectDir, 'tathya.config.yaml'),
    outputDir: join(projectDir, 'tests', 'generated'),
  };
}

export function buildInitConfig(input: InitConfigInput) {
  return {
    baseUrl: input.baseUrl,
    output: { dir: 'tests/generated', language: input.language },
    coverage: 'all',
    oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
    auth: { loginPath: input.loginPath, roles: input.roles },
    crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
    data: {
      fields: { title: 'Buy groceries', body: 'Milk, eggs, bread' },
      defaults: { text: 'Sample', email: 'user@example.com', number: '1' },
      unique: ['email'],
      duplicates: {},
      requiredFields: [],
      confirmFields: [],
      faker: { locale: input.fakerLocale ?? 'en', seed: input.fakerSeed ?? null },
    },
  };
}

export async function runInit(): Promise<void> {
  intro('TathyaTest init');
  const projectName = mustString(await text({ message: 'Project name', initialValue: 'my-test' }), 'Project name');
  const paths = initProjectPaths(projectName);

  const baseUrl = normalizeBaseUrl(mustString(await text({ message: 'URL/domain', initialValue: 'http://127.0.0.1:8000' }), 'URL/domain'));

  const loginPath = mustString(await text({ message: 'Login path', initialValue: '/login' }), 'Login path');

  const roles: Array<{ name: string; username: string; password: string }> = [];
  let addMore = true;
  while (addMore) {
    const index = roles.length;
    const name = mustString(await text({ message: 'Role name', initialValue: defaultRoleName(index) }), 'Role name');
    const username = mustString(await text({ message: `${name} username`, initialValue: `${name}@example.com` }), 'Role username');
    const rolePassword = mustString(await password({ message: `${name} password` }), `${name} password`);
    roles.push({ name, username, password: rolePassword });

    const answer = await confirm({ message: 'Add another credentials role?', initialValue: false });
    if (isCancel(answer)) throw new Error('Role entry cancelled');
    addMore = answer;
  }

  const language = mustString(await select({
    message: 'Generated Playwright language',
    options: [
      { value: 'ts', label: 'TypeScript (.ts)' },
      { value: 'js', label: 'JavaScript (.js)' },
    ],
  }), 'Generated Playwright language');

  const fakerLocale = mustString(await text({ message: 'Faker locale for generated create data', initialValue: 'en' }), 'Faker locale');
  const seedInput = mustString(await text({ message: 'Faker seed (blank = random each run)', initialValue: '' }), 'Faker seed');
  const fakerSeed = seedInput.trim() === '' ? null : Number.parseInt(seedInput.trim(), 10);
  if (fakerSeed !== null && !Number.isFinite(fakerSeed)) throw new Error('Faker seed must be an integer or blank');

  const config = buildInitConfig({ baseUrl, loginPath, roles, language, fakerLocale, fakerSeed });

  await mkdir(paths.outputDir, { recursive: true });
  await writeFile(paths.configPath, YAML.stringify(config));
  outro(`Wrote ${paths.configPath}`);
}
