import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm, intro, isCancel, outro, password, select, text } from '@clack/prompts';
import YAML from 'yaml';

type PromptValue = string | symbol;

function mustString(value: PromptValue, label: string): string {
  if (isCancel(value)) throw new Error(`${label} is required`);
  return value;
}

type LoginFields = {
  usernameField: string;
  passwordField: string;
};

type ParsedInput = {
  type: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  index: number;
};

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

export async function runInit(): Promise<void> {
  intro('TathyaTest init');
  const projectName = mustString(await text({ message: 'Project name', initialValue: 'my-test' }), 'Project name');
  const paths = initProjectPaths(projectName);

  const baseUrl = mustString(await text({ message: 'URL/domain', initialValue: 'http://127.0.0.1:8000' }), 'URL/domain');
  const engine = mustString(await select({
    message: 'Crawler engine',
    options: [
      { value: 'static', label: 'static - server-rendered HTML' },
      { value: 'rendered', label: 'rendered - JavaScript-rendered app' },
    ],
  }), 'Crawler engine');

  const loginPath = mustString(await text({ message: 'Login path', initialValue: '/login' }), 'Login path');
  const loginFields = await inferLoginFields(baseUrl, loginPath);

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

  const config = {
    baseUrl,
    extractor: { engine },
    output: { dir: 'tests/generated', language },
    coverage: 'all',
    oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
    auth: { loginPath, usernameField: loginFields.usernameField, passwordField: loginFields.passwordField, roles },
    crawl: { maxDepth: 3, maxPages: 100, include: ['/todos', '/dashboard', '/admin'], exclude: ['/logout'] },
    data: {
      fields: { title: 'Buy groceries', body: 'Milk, eggs, bread' },
      defaults: { text: 'Sample', email: 'user@example.com', number: '1' },
      unique: ['email'],
      duplicates: {},
      requiredFields: [],
      confirmFields: [],
    },
  };

  await mkdir(paths.outputDir, { recursive: true });
  await writeFile(paths.configPath, YAML.stringify(config));
  outro(`Wrote ${paths.configPath}`);
}

export function inferLoginFieldsFromHtml(html: string): LoginFields {
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map((match, index) => ({ ...parseInputAttributes(match[0]), index }));
  const passwordField = pickPasswordField(inputs) ?? 'password';
  const usernameField = pickUsernameField(inputs, passwordField) ?? 'email';
  return { usernameField, passwordField };
}

export async function inferLoginFields(baseUrl: string, loginPath: string): Promise<LoginFields> {
  try {
    const response = await fetch(new URL(loginPath, baseUrl));
    if (!response.ok) return { usernameField: 'email', passwordField: 'password' };
    return inferLoginFieldsFromHtml(await response.text());
  } catch {
    return { usernameField: 'email', passwordField: 'password' };
  }
}

function parseInputAttributes(tag: string): ParsedInput {
  return {
    type: attrValue(tag, 'type') ?? 'text',
    name: attrValue(tag, 'name') ?? '',
    id: attrValue(tag, 'id') ?? '',
    placeholder: attrValue(tag, 'placeholder') ?? '',
    autocomplete: attrValue(tag, 'autocomplete') ?? '',
    ariaLabel: attrValue(tag, 'aria-label') ?? '',
    index: -1,
  };
}

function pickPasswordField(inputs: ParsedInput[]): string | null {
  const ranked = inputs
    .filter((input) => isLoginCandidate(input))
    .map((input) => ({ input, score: scorePasswordField(input) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked[0]) return ranked[0].input.name || null;
  if (inputs.length === 2) return inputs[1].name || null;
  return null;
}

function pickUsernameField(inputs: ParsedInput[], passwordField: string): string | null {
  const ranked = inputs
    .filter((input) => input.name !== passwordField && isLoginCandidate(input))
    .map((input) => ({ input, score: scoreUsernameField(input) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked[0]) return ranked[0].input.name || null;
  const fallback = inputs.find((input) => input.name !== passwordField && isLoginCandidate(input));
  return fallback?.name || null;
}

function isLoginCandidate(input: ParsedInput): boolean {
  return !['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(input.type.toLowerCase());
}

function scorePasswordField(input: ParsedInput): number {
  const text = [input.type, input.name, input.id, input.placeholder, input.autocomplete, input.ariaLabel].join(' ').toLowerCase();
  let score = 0;
  if (input.type.toLowerCase() === 'password') score += 100;
  if (/password/.test(text)) score += 50;
  return score;
}

function scoreUsernameField(input: ParsedInput): number {
  const text = [input.type, input.name, input.id, input.placeholder, input.autocomplete, input.ariaLabel].join(' ').toLowerCase();
  let score = 0;
  if (input.type.toLowerCase() === 'email') score += 100;
  if (input.autocomplete.toLowerCase() === 'username') score += 90;
  if (input.autocomplete.toLowerCase() === 'email') score += 80;
  if (/(email|username|user|account|identifier|handle)/.test(text)) score += 50;
  return score;
}

function attrValue(tag: string, attr: string): string | null {
  const pattern = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? null;
}
