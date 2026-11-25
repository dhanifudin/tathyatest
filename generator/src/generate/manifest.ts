import { isMutating, type TestCase } from './test-case.js';
import { canonicalPath } from '../util/paths.js';
import type { FaultClass } from '../fault-classes.js';

export type ManifestCategory = 'auth' | 'crud' | 'nav' | 'rbac';
export type ManifestTier = 'positive' | 'negative' | 'edge';
export type { FaultClass } from '../fault-classes.js';

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
  /** Navigation scenario (`link:`, `button:`, `select:`, `pagination:` key) this test covers; null for other categories. */
  scenarioKey?: string | null;
};

/** `assertionCounts[i]` is what case `i` asserts once planned (`ir/count.ts`). */
export function buildManifest(cases: TestCase[], assertionCounts: readonly number[]): ManifestEntry[] {
  return cases.map((testCase, index) => entryFor(testCase, index, assertionCounts[index] ?? 0));
}

/** The classification of one case — shared by the manifest and by the emitter's tags/annotations. */
export type CaseMeta = Omit<ManifestEntry, 'id' | 'title' | 'assertionCount'>;

export function caseMeta(testCase: TestCase): CaseMeta {
  return { ...classify(testCase), mutating: isMutating(testCase) };
}

function classify(testCase: TestCase): Omit<CaseMeta, 'mutating'> {
  switch (testCase.kind) {
    case 'auth':
      return {
        category: 'auth', tier: testCase.tier, role: testCase.role,
        route: testCase.logout ? canonicalPath(testCase.logout.page.url) : null,
        targetForm: testCase.logout ? `${testCase.logout.form.method}:${canonicalPath(testCase.logout.form.action)}` : null,
        targetField: null, constraintKind: null,
        locatorStrategy: testCase.logout?.form.submit.locator.strategy ?? null, faultClass: 'auth',
        scenarioKey: null,
      };
    case 'form': {
      const negative = testCase.variant.kind !== 'positive';
      return {
        category: 'crud', tier: testCase.tier, role: testCase.role,
        route: canonicalPath(testCase.page.url),
        targetForm: `${testCase.form.method}:${canonicalPath(testCase.form.action)}`,
        targetField: testCase.targetField?.name ?? null,
        constraintKind: constraintKindFor(testCase.variant.name),
        locatorStrategy: (testCase.targetField ?? testCase.form.fields[0])?.locator.strategy ?? testCase.form.submit.locator.strategy,
        faultClass: negative ? 'validation' : 'crud',
        scenarioKey: null,
      };
    }
    case 'interaction':
      return {
        category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null, locatorStrategy: testCase.interaction.locator.strategy,
        faultClass: null, scenarioKey: testCase.scenarioKey ?? null,
      };
    case 'pagination':
      return {
        category: 'nav', tier: 'positive', role: testCase.role,
        route: canonicalPath(testCase.page.url), targetForm: null, targetField: null,
        constraintKind: null,
        locatorStrategy: testCase.pagination.locator.strategy, faultClass: 'pagination',
        scenarioKey: testCase.scenarioKey ?? null,
      };
    case 'rbac':
      return {
        category: 'rbac', tier: testCase.tier, role: testCase.role,
        route: canonicalPath(testCase.route), targetForm: null, targetField: null,
        constraintKind: null, locatorStrategy: testCase.affordance?.locator.strategy ?? null, faultClass: 'authz',
        scenarioKey: null,
      };
  }
}

function entryFor(testCase: TestCase, index: number, assertionCount: number): ManifestEntry {
  const { locatorStrategy, faultClass, scenarioKey, mutating, ...head } = caseMeta(testCase);
  // Spelled out so the written manifest keeps its field order.
  return { id: `t${String(index + 1).padStart(4, '0')}`, title: testCase.title, ...head, assertionCount, locatorStrategy, faultClass, scenarioKey, mutating };
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

