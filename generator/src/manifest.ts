import { isMutating, type TestCase } from './mapper.js';

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
  /** Running the test can change app data (POST forms, button clicks, failed logins). */
  mutating: boolean;
};

export function buildManifest(cases: TestCase[]): ManifestEntry[] {
  return cases.map((testCase, index) => entryFor(testCase, index));
}

/** The classification of one case — shared by the manifest and by the emitter's tags/annotations. */
export type CaseMeta = Omit<ManifestEntry, 'id' | 'title'>;

export function caseMeta(testCase: TestCase): CaseMeta {
  return { ...classify(testCase), mutating: isMutating(testCase) };
}

function classify(testCase: TestCase): Omit<CaseMeta, 'mutating'> {
  switch (testCase.kind) {
    case 'auth':
      return {
        category: 'auth', tier: testCase.tier, role: testCase.role,
        route: null, targetForm: null, targetField: null, constraintKind: null,
        assertionCount: 1, locatorStrategy: null, faultClass: 'auth',
      };
    case 'form': {
      const negative = testCase.variant.kind !== 'positive';
      return {
        category: 'crud', tier: testCase.tier, role: testCase.role,
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
        category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: 1, locatorStrategy: testCase.interaction.locator.strategy,
        faultClass: null,
      };
    case 'pagination':
      return {
        category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: testCase.pagination.href ? 2 : 1,
        locatorStrategy: testCase.pagination.locator.strategy, faultClass: 'pagination',
      };
    case 'rbac':
      return {
        category: 'rbac', tier: testCase.tier, role: testCase.role,
        route: canonicalPath(testCase.route), targetForm: null, targetField: null,
        constraintKind: null, assertionCount: 1, locatorStrategy: null, faultClass: 'authz',
      };
  }
}

function entryFor(testCase: TestCase, index: number): ManifestEntry {
  return { id: `t${String(index + 1).padStart(4, '0')}`, title: testCase.title, ...caseMeta(testCase) };
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
  if (variantName === 'step-misaligned') return 'step';
  if (variantName === 'accept-mismatch') return 'accept';
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
