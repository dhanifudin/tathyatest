import type { TestCase } from './mapper.js';

export type ManifestCategory = 'auth' | 'crud' | 'nav' | 'rbac';
export type ManifestTier = 'positive' | 'negative' | 'edge';
export type FaultClass = 'validation' | 'authz' | 'crud' | 'pagination' | 'auth';

/**
 * One entry per generated test. `title` is the exact `test(...)` title, so it joins directly
 * against Playwright's JSON reporter output. Coverage and test-quality metrics are computed from
 * this manifest rather than by parsing spec source.
 */
export type ManifestEntry = {
  id: string;
  title: string;
  category: ManifestCategory;
  tier: ManifestTier;
  role: string;
  route: string | null;
  targetForm: string | null;
  targetField: string | null;
  constraintKind: string | null;
  assertionCount: number;
  locatorStrategy: string | null;
  faultClass: FaultClass | null;
};

export function buildManifest(cases: TestCase[]): ManifestEntry[] {
  return cases.map((testCase, index) => entryFor(testCase, index));
}

function entryFor(testCase: TestCase, index: number): ManifestEntry {
  const id = `t${String(index + 1).padStart(4, '0')}`;
  switch (testCase.kind) {
    case 'auth':
      return {
        id, title: testCase.title, category: 'auth', tier: testCase.tier, role: testCase.role,
        route: null, targetForm: null, targetField: null, constraintKind: null,
        assertionCount: 1, locatorStrategy: null, faultClass: 'auth',
      };
    case 'form': {
      const negative = testCase.variant.kind !== 'positive';
      return {
        id, title: testCase.title, category: 'crud', tier: testCase.tier, role: testCase.role,
        route: canonicalPath(testCase.page.url),
        targetForm: `${testCase.form.method}:${canonicalPath(testCase.form.action)}`,
        targetField: testCase.targetField?.name ?? null,
        constraintKind: constraintKindFor(testCase.variant.name),
        assertionCount: testCase.form.crudOp === 'delete' ? 2 : 1,
        locatorStrategy: (testCase.targetField ?? testCase.form.fields[0])?.locator.strategy ?? testCase.form.submit.locator.strategy,
        faultClass: negative ? 'validation' : 'crud',
      };
    }
    case 'interaction':
      return {
        id, title: testCase.title, category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: 1, locatorStrategy: testCase.interaction.locator.strategy,
        faultClass: null,
      };
    case 'pagination':
      return {
        id, title: testCase.title, category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: testCase.pagination.href ? 2 : 1,
        locatorStrategy: testCase.pagination.locator.strategy, faultClass: 'pagination',
      };
    case 'rbac':
      return {
        id, title: testCase.title, category: 'rbac', tier: testCase.tier, role: testCase.role,
        route: canonicalPath(testCase.route), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: 1, locatorStrategy: null, faultClass: 'authz',
      };
  }
}

function constraintKindFor(variantName: string): string | null {
  if (variantName === 'valid' || variantName === 'delete') return null;
  if (variantName === 'required-empty') return 'required';
  if (variantName.endsWith('-format')) return 'type';
  if (variantName === 'pattern-fail') return 'pattern';
  if (variantName.startsWith('minlength')) return 'minlength';
  if (variantName.startsWith('maxlength')) return 'maxlength';
  if (variantName.startsWith('min-')) return 'min';
  if (variantName.startsWith('max-')) return 'max';
  if (variantName === 'invalid-option') return 'option';
  if (variantName === 'duplicate') return 'unique';
  if (variantName === 'confirmation-mismatch') return 'confirmation';
  if (['very-long', 'unicode', 'whitespace', 'optional-omitted'].includes(variantName)) return 'robustness';
  return null;
}

function canonicalPath(path: string): string {
  try {
    return new URL(path, 'http://tathyatest.local').pathname || '/';
  } catch {
    const [withoutHash] = path.split('#', 1);
    const [withoutQuery] = withoutHash.split('?', 1);
    return withoutQuery || '/';
  }
}
