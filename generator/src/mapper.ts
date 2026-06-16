import type { CrawlOutput, Field, Form, PageModel } from './crawl.js';
import type { TathyaConfig } from './config.js';
import { shouldIncludeCoverage } from './config.js';
import type { AccessMatrix } from './rbac.js';
import { variantsForField, validValueForField, type FieldVariant } from './fieldgen.js';

export type TestCaseKind = 'auth' | 'crud' | 'rbac';
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
      kind: 'crud';
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
    for (const page of crawl.pages) {
      cases.push({
        kind: 'rbac',
        tier: 'positive',
        title: `${crawl.role} can visit ${page.url} -> allowed`,
        role: crawl.role,
        route: page.url,
        expectAllowed: true,
      });
      for (const form of page.forms) {
        if (form.fields.length > 0) {
          const baseValues = buildBaseValues(form, config);
          cases.push({
            kind: 'crud',
            tier: 'positive',
            title: `${crawl.role} ${page.url} ${form.crudOp} - valid -> success`,
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
                kind: 'crud',
                tier: variant.kind,
                title: `${crawl.role} ${page.url} ${form.crudOp} - ${field.name} ${variant.name} -> ${variant.outcome}`,
                role: crawl.role,
                page,
                form,
                targetField: field,
                variant,
                values,
              });
            }
          }
        }
      }
      const deleteForm = page.forms.find((form) => form.crudOp === 'delete' && form.fields.length === 0);
      if (deleteForm) {
        cases.push({
          kind: 'crud',
          tier: 'positive',
          title: `${crawl.role} ${page.url} delete -> success`,
          role: crawl.role,
          page,
          form: deleteForm,
          targetField: null,
          variant: { kind: 'positive', name: 'delete', value: '', outcome: 'success' },
          values: {},
        });
      }
    }
  }

  if (shouldIncludeCoverage(config.coverage, 'negative')) {
    const roles = config.auth.roles.map((role) => role.name);
    for (const entry of matrix.values()) {
      for (const role of roles) {
        if (!entry.reachableBy.includes(role)) {
          cases.push({
            kind: 'rbac',
            tier: 'negative',
            title: `${role} cannot visit ${entry.route} -> blocked`,
            role,
            route: entry.route,
            expectAllowed: false,
          });
        }
      }
    }
  }

  return cases;
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
