import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { FaultClass, ManifestCategory, ManifestEntry, ManifestTier } from '../manifest.js';

/**
 * One seeded fault. `id` must match a toggle the app under test exposes on its fault endpoint
 * (`evaluation.controlPlane.fault`, activated with `{ id }`). `relevant` selects, from the generated
 * manifest, the tests that *should* detect this fault; the fault is "killed" if any relevant test
 * fails while it is active.
 */
export type FaultSpec = {
  id: string;
  faultClass: FaultClass;
  description: string;
  relevant: (entry: ManifestEntry) => boolean;
};

/**
 * Declarative form of `relevant`, used by per-project catalogue files
 * (`evaluation.faults.catalogue`): every given field must match the manifest entry.
 */
export type FaultMatcher = {
  category: ManifestCategory;
  tier?: ManifestTier;
  constraintKind?: string;
  targetField?: string;
  /** Substring match on the target field name, e.g. "email". */
  targetFieldIncludes?: string;
  faultClass?: FaultClass;
};

const faultClassSchema = z.enum(['validation', 'authz', 'crud', 'pagination', 'auth']);
const matcherSchema = z.object({
  category: z.enum(['auth', 'crud', 'nav', 'rbac']),
  tier: z.enum(['positive', 'negative', 'edge']).optional(),
  constraintKind: z.string().optional(),
  targetField: z.string().optional(),
  targetFieldIncludes: z.string().optional(),
  faultClass: faultClassSchema.optional(),
});
const catalogueFileSchema = z.array(z.object({
  id: z.string().min(1),
  faultClass: faultClassSchema,
  description: z.string().default(''),
  relevant: matcherSchema,
}));
export type FaultCatalogueFile = z.infer<typeof catalogueFileSchema>;

export function relevantFromMatcher(matcher: FaultMatcher): (entry: ManifestEntry) => boolean {
  return (entry) =>
    entry.category === matcher.category
    && (matcher.tier === undefined || entry.tier === matcher.tier)
    && (matcher.constraintKind === undefined || entry.constraintKind === matcher.constraintKind)
    && (matcher.targetField === undefined || entry.targetField === matcher.targetField)
    && (matcher.targetFieldIncludes === undefined || (entry.targetField?.includes(matcher.targetFieldIncludes) ?? false))
    && (matcher.faultClass === undefined || entry.faultClass === matcher.faultClass);
}

export function faultSpecsFromFile(entries: FaultCatalogueFile): FaultSpec[] {
  return entries.map((entry) => ({
    id: entry.id,
    faultClass: entry.faultClass,
    description: entry.description,
    relevant: relevantFromMatcher(entry.relevant),
  }));
}

/** Built-in catalogue for the Laravel case studies (toggles live in their FaultRegistry). */
export const FAULT_CATALOGUE: FaultSpec[] = [
  {
    id: 'validation_title_required',
    faultClass: 'validation',
    description: 'Drop the required rule on the title field',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'negative' && entry.constraintKind === 'required' && entry.targetField === 'title',
  },
  {
    id: 'validation_email_format',
    faultClass: 'validation',
    description: 'Drop the email format rule',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'negative' && entry.constraintKind === 'type' && (entry.targetField?.includes('email') ?? false),
  },
  {
    id: 'validation_unique_drop',
    faultClass: 'validation',
    description: 'Drop the unique constraint',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'negative' && entry.constraintKind === 'unique',
  },
  {
    id: 'validation_confirmation_drop',
    faultClass: 'validation',
    description: 'Drop the confirmed rule on confirmation fields',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'negative' && entry.constraintKind === 'confirmation',
  },
  {
    id: 'validation_maxlength_drop',
    faultClass: 'validation',
    description: 'Drop the max length rule',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'negative' && entry.constraintKind === 'maxlength',
  },
  {
    id: 'authz_admin_open',
    faultClass: 'authz',
    description: 'Remove the admin-only middleware so any role can reach admin routes',
    relevant: (entry) => entry.category === 'rbac' && entry.tier === 'negative',
  },
  {
    id: 'crud_skip_persist',
    faultClass: 'crud',
    description: 'Skip persisting created/updated resources',
    relevant: (entry) => entry.category === 'crud' && entry.tier === 'positive',
  },
  {
    id: 'pagination_off_by_one',
    faultClass: 'pagination',
    description: 'Shift pagination targets by one page',
    relevant: (entry) => entry.category === 'nav' && entry.faultClass === 'pagination',
  },
  {
    id: 'auth_accept_any',
    faultClass: 'auth',
    description: 'Accept any password at login',
    relevant: (entry) => entry.category === 'auth' && entry.tier === 'negative',
  },
];

/**
 * The catalogue a run uses: the built-in one, with entries from `evaluation.faults.catalogue`
 * (a JSON file) merged over it by id — same id replaces, new ids append.
 */
export async function loadFaultCatalogue(cataloguePath: string | undefined): Promise<FaultSpec[]> {
  if (!cataloguePath) return FAULT_CATALOGUE;
  const parsed = catalogueFileSchema.parse(JSON.parse(await readFile(cataloguePath, 'utf8')));
  return mergeCatalogues(FAULT_CATALOGUE, faultSpecsFromFile(parsed));
}

export function mergeCatalogues(base: FaultSpec[], extra: FaultSpec[]): FaultSpec[] {
  const byId = new Map(base.map((fault) => [fault.id, fault] as const));
  for (const fault of extra) byId.set(fault.id, fault);
  return [...byId.values()];
}

export function faultsForClasses(classes: FaultClass[], catalogue: FaultSpec[] = FAULT_CATALOGUE): FaultSpec[] {
  const enabled = new Set(classes);
  return catalogue.filter((fault) => enabled.has(fault.faultClass));
}
