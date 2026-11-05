import type { Field, Form } from '../../crawl/model.js';
import type { TathyaConfig } from '../../config.js';
import { routeShape } from '../../generate/rbac.js';
import { canonicalPath } from '../../util/paths.js';
import type { SuiteRun } from '../types.js';
import { type Ratio, type CrudExercised } from './types.js';

// ---- helpers ----------------------------------------------------------------------------------

export function durationsOf(runs: SuiteRun[]): number[] {
  return runs.flatMap((run) => run.outcomes.filter((outcome) => outcome.status !== 'skipped').map((outcome) => outcome.durationMs));
}

export function distinctTitles(runs: SuiteRun[]): number {
  return new Set(runs.flatMap((run) => run.outcomes.map((outcome) => outcome.title))).size;
}

export function ratio(covered: number, total: number): Ratio {
  return { covered, total, ratio: total === 0 ? (covered === 0 ? 1 : 0) : covered / total };
}

export function intersectionSize(total: Set<string>, covered: Set<string>): number {
  let count = 0;
  for (const value of covered) if (total.has(value)) count += 1;
  return count;
}

export function keysAlign(coveredRouteForm: string, formKey: string): boolean {
  // coveredRouteForm = `${routeShape}|${method}:${action}`; formKey = `${routeShape}|${method}|${actionShape}|fields`.
  const [route, methodAction] = coveredRouteForm.split('|', 2);
  const [method, action] = (methodAction ?? '').split(':', 2);
  return formKey.startsWith(`${route}|${method}|${routeShape(action ?? '/')}|`);
}

// Form/field coverage is counted at scenario granularity (route + action shapes), matching
// the mapper's one-representative-per-shape emission — see the totalRoutes comment above.
export function formKeyOf(route: string, form: Form): string {
  return `${routeShape(route)}|${form.method}|${routeShape(canonicalPath(form.action))}|${form.fields.map((field) => field.name).join(',')}`;
}

export function constraintKindsOfField(field: Field, config: TathyaConfig): string[] {
  const kinds: string[] = [];
  if (field.required) kinds.push('required');
  if (field.constraints.minlength !== null) kinds.push('minlength');
  if (field.constraints.maxlength !== null) kinds.push('maxlength');
  if (field.constraints.min !== null) kinds.push('min');
  if (field.constraints.max !== null) kinds.push('max');
  if (field.constraints.pattern !== null) kinds.push('pattern');
  if (field.constraints.step !== null && ['number', 'range'].includes(field.type)) kinds.push('step');
  if (field.constraints.accept !== null && field.type === 'file') kinds.push('accept');
  // Mirrors fieldgen's FORMAT_VARIANT_TYPES: number/date/color inputs sanitise bad input natively,
  // so no format variant exists for them and they must not count as a present constraint.
  if (['email', 'url', 'tel'].includes(field.type)) kinds.push('type');
  if (field.options?.length) kinds.push('option');
  if (config.data.unique.includes(field.name)) kinds.push('unique');
  if (field.nameHints.includes('confirmation') || config.data.confirmFields.includes(field.name)) kinds.push('confirmation');
  if (['text', 'search', 'textarea'].includes(field.type)) kinds.push('robustness');
  return kinds;
}

export function markResource(map: Record<string, CrudExercised>, route: string, op: 'create' | 'read' | 'update' | 'delete'): void {
  const resource = resourceOf(route);
  if (!resource) return;
  const entry = (map[resource] ??= { create: false, read: false, update: false, delete: false });
  entry[op] = true;
}

export function resourceOf(route: string): string | null {
  const segments = canonicalPath(route).split('/').filter(Boolean);
  return segments[0] ?? null;
}
