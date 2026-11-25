import type { TathyaConfig } from '../config.js';
import { caseMeta } from '../generate/manifest.js';
import { routeShape } from '../generate/rbac.js';
import type { TestCase } from '../generate/test-case.js';
import { canonicalPath } from '../util/paths.js';

type FormCase = Extract<TestCase, { kind: 'form' }>;

/** Spec file stem per category and route shape: `auth/login`, `forms/todos-create`, `rbac/admin-users`. */
export function specStemFor(testCase: TestCase): string {
  switch (testCase.kind) {
    case 'auth':
      return 'auth/login';
    case 'form':
      return `forms/${routeSlug(testCase.page.url)}`;
    case 'interaction':
      return `interactions/${routeSlug(testCase.page.url)}`;
    case 'pagination':
      return `pagination/${routeSlug(testCase.page.url)}`;
    case 'rbac':
      return `rbac/${routeSlug(testCase.route)}`;
  }
}

function routeSlug(url: string): string {
  const slug = routeShape(canonicalPath(url))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'root';
}

export function describeTitle(testCase: TestCase): string {
  switch (testCase.kind) {
    case 'auth':
      return `${testCase.role} login`;
    case 'rbac':
      return `${testCase.role} · ${canonicalPath(testCase.route)}`;
    default:
      return `${testCase.role} · ${canonicalPath(testCase.page.url)}`;
  }
}

/** One subgroup per form (method, action, submit label) — the title is unique per such key. */
export function formDescribeTitle(testCase: FormCase): string {
  const label = testCase.form.submit.text ? `"${testCase.form.submit.text}" form` : 'form';
  return `${label} → ${testCase.form.method} ${canonicalPath(testCase.form.action)}`;
}

/** Tags and annotations from the same classification the manifest records. */
export function tagsAndAnnotations(testCase: TestCase): { tags: string[]; annotations: { type: string; description: string }[] } {
  const meta = caseMeta(testCase);
  const tags = [`@${meta.tier}`, `@${meta.category}`, `@role:${meta.role}`, meta.mutating ? '@write' : '@read'];
  const annotations: { type: string; description: string }[] = [
    { type: 'tier', description: meta.tier },
    { type: 'category', description: meta.category },
  ];
  if (meta.route) annotations.push({ type: 'route', description: meta.route });
  if (meta.targetField) annotations.push({ type: 'targetField', description: meta.targetField });
  if (meta.constraintKind) annotations.push({ type: 'constraintKind', description: meta.constraintKind });
  return { tags, annotations };
}

/**
 * Where a link click must end up, or null when that is unknowable: fragment/javascript hrefs,
 * and logout links (they redirect to the login page by design).
 */
export function linkLandingPath(testCase: Extract<TestCase, { kind: 'interaction' }>, config: Pick<TathyaConfig, 'baseUrl'>): string | null {
  const href = testCase.interaction.href;
  if (testCase.interaction.type !== 'link' || !href) return null;
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#') || /^(javascript|mailto|tel):/i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed, config.baseUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(config.baseUrl).origin) return null;
  if (/(^|\/)(logout|log-out|signout|sign-out)(\/|$)/i.test(url.pathname)) return null;
  return url.pathname;
}

export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
