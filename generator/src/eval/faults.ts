import type { FaultClass, ManifestEntry } from '../manifest.js';

/**
 * One seeded fault. `id` must match a toggle in the case study's `FaultRegistry` (activated via
 * `POST /__testing/fault`). `relevant` selects, from the generated manifest, the tests that *should*
 * detect this fault; the fault is "killed" if any relevant test fails while it is active.
 */
export type FaultSpec = {
  id: string;
  faultClass: FaultClass;
  description: string;
  relevant: (entry: ManifestEntry) => boolean;
};

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

export function faultsForClasses(classes: FaultClass[]): FaultSpec[] {
  const enabled = new Set(classes);
  return FAULT_CATALOGUE.filter((fault) => enabled.has(fault.faultClass));
}
