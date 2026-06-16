import type { CrawlOutput, Field, Form, Locator, PageModel } from './crawl.js';
import type { TathyaConfig } from './config.js';
import { shouldIncludeCoverage } from './config.js';
import type { AccessMatrix } from './rbac.js';
import { variantsForField, validValueForField, type FieldVariant } from './fieldgen.js';

export type TestCaseKind = 'auth' | 'form' | 'interaction' | 'rbac';
export type TestCase =
  | {
      kind: 'auth';
      tier: 'positive' | 'negative';
      title: string;
      role: string;
      username: string;
      password: string;
      expectSuccess: boolean;
    }
  | {
      kind: 'form';
      tier: 'positive' | 'negative' | 'edge';
      title: string;
      role: string;
      page: PageModel;
      form: Form;
      targetField: Field | null;
      variant: FieldVariant;
      values: Record<string, string>;
    }
  | {
      kind: 'interaction';
      tier: 'positive';
      title: string;
      role: string;
      page: PageModel;
      interaction: {
        type: 'link' | 'button';
        label: string;
        locator: Locator;
        ordinal: number;
        href?: string;
      };
    }
  | {
      kind: 'rbac';
      tier: 'positive' | 'negative';
      title: string;
      role: string;
      route: string;
      expectAllowed: boolean;
    };

export function mapTestCases(crawls: CrawlOutput[], matrix: AccessMatrix, config: TathyaConfig): TestCase[] {
  const cases: TestCase[] = [];
  for (const role of config.auth.roles) {
    cases.push({
      kind: 'auth',
      tier: 'positive',
      title: `login ${role.name} valid -> success`,
      role: role.name,
      username: role.username,
      password: role.password,
      expectSuccess: true,
    });
    if (shouldIncludeCoverage(config.coverage, 'negative')) {
      cases.push({
        kind: 'auth',
        tier: 'negative',
        title: `login ${role.name} wrong-password -> error`,
        role: role.name,
        username: role.username,
        password: `${role.password}-wrong`,
        expectSuccess: false,
      });
    }
  }

  for (const crawl of crawls) {
    const seenPages = new Set<string>();
    for (const page of crawl.pages) {
      const canonicalPageUrl = canonicalPath(page.url);
      const pageKey = `${crawl.role}:${canonicalPageUrl}`;
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);
      cases.push({
        kind: 'rbac',
        tier: 'positive',
        title: `${crawl.role} can visit ${canonicalPageUrl} -> allowed`,
        role: crawl.role,
        route: canonicalPageUrl,
        expectAllowed: true,
      });
      for (const form of page.forms) {
        if (form.fields.length > 0) {
          const baseValues = buildBaseValues(form, config);
          cases.push({
            kind: 'form',
            tier: 'positive',
            title: `${crawl.role} ${canonicalPageUrl} ${formLabel(form)} - valid -> success`,
            role: crawl.role,
            page,
            form,
            targetField: null,
            variant: { kind: 'positive', name: 'valid', value: '', outcome: 'success' },
            values: baseValues,
          });
          for (const field of form.fields) {
            for (const variant of variantsForField(field, {
              dataFields: config.data.fields,
              defaults: config.data.defaults,
              unique: config.data.unique,
              duplicates: config.data.duplicates,
              requiredFields: config.data.requiredFields,
              confirmFields: config.data.confirmFields,
            })) {
              if (variant.kind === 'positive') continue;
              if (form.crudOp === 'update' && variant.name === 'duplicate') continue;
              if (!shouldIncludeCoverage(config.coverage, variant.kind)) continue;
              const values = { ...baseValues };
              if (variant.omit) delete values[field.name];
              else values[field.name] = variantValue(field, variant, baseValues);
              cases.push({
                kind: 'form',
                tier: variant.kind,
                title: `${crawl.role} ${canonicalPageUrl} ${formLabel(form)} - ${field.name} ${variant.name} -> ${variant.outcome}`,
                role: crawl.role,
                page,
                form,
                targetField: field,
                variant,
                values,
              });
            }
          }
        } else {
          cases.push({
            kind: 'form',
            tier: 'positive',
            title: `${crawl.role} ${canonicalPageUrl} ${formLabel(form)} -> success`,
            role: crawl.role,
            page,
            form,
            targetField: null,
            variant: { kind: 'positive', name: form.crudOp === 'delete' ? 'delete' : 'valid', value: '', outcome: 'success' },
            values: {},
          });
        }
      }
      cases.push(...interactionCasesForPage(crawl.role, page, canonicalPageUrl));
    }
  }

  if (shouldIncludeCoverage(config.coverage, 'negative')) {
    const roles = config.auth.roles.map((role) => role.name);
    const seenBlockedRoutes = new Set<string>();
    for (const entry of matrix.values()) {
      const route = canonicalPath(entry.route);
      for (const role of roles) {
        if (!entry.reachableBy.includes(role)) {
          const key = `${role}:${route}`;
          if (seenBlockedRoutes.has(key)) continue;
          seenBlockedRoutes.add(key);
          cases.push({
            kind: 'rbac',
            tier: 'negative',
            title: `${role} cannot visit ${route} -> blocked`,
            role,
            route,
            expectAllowed: false,
          });
        }
      }
    }
  }

  return uniquifyTitles(cases);
}

function interactionCasesForPage(role: string, page: PageModel, canonicalPageUrl: string): TestCase[] {
  type PendingInteraction = Omit<Extract<TestCase, { kind: 'interaction' }>, 'title'> & { titleBase: string };
  const pending: PendingInteraction[] = [];
  const ordinals = new Map<string, number>();
  const nextOrdinal = (type: 'link' | 'button', locator: Locator): number => {
    const key = `${type}:${locator.strategy}:${locator.value}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    return ordinal;
  };

  for (const link of page.links) {
    const label = link.text || canonicalPath(link.href) || `${link.locator.strategy}:${link.locator.value}`;
    pending.push({
      kind: 'interaction',
      tier: 'positive',
      titleBase: `${role} ${canonicalPageUrl} link ${label}`,
      role,
      page,
      interaction: {
        type: 'link',
        label,
        locator: link.locator,
        ordinal: nextOrdinal('link', link.locator),
        href: link.href,
      },
    });
  }

  for (const button of page.buttons) {
    const label = button.text || `${button.locator.strategy}:${button.locator.value}`;
    pending.push({
      kind: 'interaction',
      tier: 'positive',
      titleBase: `${role} ${canonicalPageUrl} button ${label}`,
      role,
      page,
      interaction: {
        type: 'button',
        label,
        locator: button.locator,
        ordinal: nextOrdinal('button', button.locator),
      },
    });
  }

  const titleCounts = countBy(pending.map((testCase) => testCase.titleBase));
  const titleOrdinals = new Map<string, number>();
  return pending.map(({ titleBase, ...testCase }) => {
    const ordinal = titleOrdinals.get(titleBase) ?? 0;
    titleOrdinals.set(titleBase, ordinal + 1);
    const title = titleCounts.get(titleBase)! > 1
      ? `${titleBase} #${ordinal + 1} -> handled`
      : `${titleBase} -> handled`;
    return { ...testCase, title };
  });
}

function formLabel(form: Form): string {
  return form.crudOp === 'unknown' ? 'form' : form.crudOp;
}

function canonicalPath(path: string): string {
  try {
    const url = new URL(path, 'http://tathyatest.local');
    return url.pathname || '/';
  } catch {
    const [withoutHash] = path.split('#', 1);
    const [withoutQuery] = withoutHash.split('?', 1);
    return withoutQuery || '/';
  }
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function uniquifyTitles(cases: TestCase[]): TestCase[] {
  const totals = countBy(cases.map((testCase) => testCase.title));
  const ordinals = new Map<string, number>();
  return cases.map((testCase) => {
    if (totals.get(testCase.title)! <= 1) return testCase;
    const ordinal = ordinals.get(testCase.title) ?? 0;
    ordinals.set(testCase.title, ordinal + 1);
    return {
      ...testCase,
      title: appendTitleOrdinal(testCase.title, ordinal + 1),
    } as TestCase;
  });
}

function appendTitleOrdinal(title: string, ordinal: number): string {
  const marker = ` #${ordinal}`;
  return title.includes(' -> ')
    ? title.replace(' -> ', `${marker} -> `)
    : `${title}${marker}`;
}

function buildBaseValues(form: Form, config: TathyaConfig): Record<string, string> {
  const values = new Map<string, string>();
  for (const field of form.fields) {
    values.set(field.name, validValueForField(field, {
      dataFields: config.data.fields,
      defaults: config.data.defaults,
      unique: config.data.unique,
      duplicates: config.data.duplicates,
      requiredFields: config.data.requiredFields,
      confirmFields: config.data.confirmFields,
    }));
  }

  for (const field of form.fields) {
    const sourceName = confirmationSourceName(field);
    if (sourceName && values.has(sourceName)) {
      values.set(field.name, values.get(sourceName) ?? values.get(field.name) ?? '');
    }
  }

  return Object.fromEntries(values);
}

function confirmationSourceName(field: Field): string | null {
  if (field.name.endsWith('_confirmation')) {
    return field.name.slice(0, -'_confirmation'.length);
  }
  return null;
}

function variantValue(field: Field, variant: FieldVariant, baseValues: Record<string, string>): string {
  if (variant.name === 'confirmation-mismatch') {
    return `${baseValues[field.name] ?? variant.value}-mismatch`;
  }
  return variant.value;
}
