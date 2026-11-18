import type { TathyaConfig } from '../../config.js';
import { routeShape, type AccessMatrix } from '../../generate/rbac.js';
import { navScenarioKeysForPage } from '../../generate/mapper.js';
import type { ManifestEntry } from '../../generate/manifest.js';
import { canonicalPath } from '../../util/paths.js';
import { type Ratio, type MetricsInput, type CoverageMetrics, type CrudExercised } from './types.js';
import { ratio, intersectionSize, keysAlign, formKeyOf, constraintKindsOfField, markResource } from './helpers.js';

// ---- Family A: model / generation coverage ----------------------------------------------------

export function coverageMetrics(input: MetricsInput): CoverageMetrics {
  const { manifest, crawls, matrix, config } = input;

  const totalRoutes = new Set<string>();
  const totalForms = new Set<string>();
  const totalFields = new Set<string>();
  const navScenarios = new Set<string>();
  const crudByResource: Record<string, CrudExercised> = {};
  const crudExercisedByResource: Record<string, CrudExercised> = {};
  const formOps: Array<{ formKey: string; route: string; op: 'create' | 'update' | 'delete' }> = [];
  const presentConstraints = new Set<string>();

  for (const crawl of crawls) {
    const seenPageShapes = new Set<string>();
    for (const page of crawl.pages) {
      const route = canonicalPath(page.url);
      // Route coverage is counted at scenario granularity (route shape): the mapper emits one
      // representative test per shape, so per-row concrete routes would undercount forever.
      totalRoutes.add(routeShape(route));
      // Nav scenarios come from the same representative page per shape the mapper processes;
      // duplicate pages (other row ids, other page numbers) offer no new scenarios.
      const firstOfShape = !seenPageShapes.has(routeShape(route));
      seenPageShapes.add(routeShape(route));
      markResource(crudByResource, route, 'read');
      for (const form of page.forms) {
        const formKey = formKeyOf(route, form);
        if (form.fields.length > 0) {
          totalForms.add(formKey);
          for (const field of form.fields) {
            totalFields.add(`${formKey}|${field.name}`);
            for (const kind of constraintKindsOfField(field, config)) presentConstraints.add(kind);
          }
        }
        if (form.crudOp === 'create' || form.crudOp === 'update' || form.crudOp === 'delete') {
          markResource(crudByResource, canonicalPath(form.action), form.crudOp);
          formOps.push({ formKey: formKeyOf(route, form), route: canonicalPath(form.action), op: form.crudOp });
        }
      }
      // Nav is counted per unique scenario (per role), mirroring the mapper's dedup keys:
      // ten row-edit links or the navbar on every page are one scenario each.
      if (firstOfShape) {
        for (const key of navScenarioKeysForPage(page, crawl.baseUrl)) {
          navScenarios.add(`${crawl.role}|${key}`);
        }
      }
    }
  }

  const coveredRoutes = new Set(
    manifest
      .map((entry) => entry.route)
      .filter((route): route is string => route !== null)
      .map((route) => routeShape(canonicalPath(route))),
  );
  const coveredForms = new Set(
    manifest
      .filter((entry) => entry.category === 'crud' && entry.targetForm && entry.route)
      .map((entry) => `${routeShape(canonicalPath(entry.route ?? '/'))}|${entry.targetForm}`),
  );
  // A field is covered when its form is exercised at all (the positive case fills every field).
  const coveredFormKeys = new Set([...totalForms].filter((key) => [...coveredForms].some((covered) => keysAlign(covered, key))));
  const coveredFieldCount = [...totalFields].filter((fieldKey) => [...coveredFormKeys].some((formKey) => fieldKey.startsWith(`${formKey}|`))).length;
  // Navigation is matched by scenario key (the generator records the key each nav test covers), so a surplus
  // test can no longer hide a missing scenario the way a plain count could.
  const coveredNavKeys = new Set(manifest.filter((entry) => entry.category === 'nav' && entry.scenarioKey).map((entry) => `${entry.role}|${entry.scenarioKey}`));

  // Fields probed: a negative or edge test targets the field (a valid submit fills every field, so it proves nothing per field).
  const probedByForm = new Map<string, Set<string>>();
  for (const entry of manifest) {
    if (entry.category !== 'crud' || entry.tier === 'positive' || !entry.targetForm || !entry.targetField || !entry.route) continue;
    const key = `${routeShape(canonicalPath(entry.route))}|${entry.targetForm}`;
    const fields = probedByForm.get(key) ?? new Set<string>();
    fields.add(entry.targetField);
    probedByForm.set(key, fields);
  }
  const probedFieldCount = [...totalFields].filter((fieldKey) => {
    const split = fieldKey.lastIndexOf('|');
    const formKey = fieldKey.slice(0, split);
    const name = fieldKey.slice(split + 1);
    return [...probedByForm].some(([coveredForm, fields]) => fields.has(name) && keysAlign(coveredForm, formKey));
  }).length;

  // CRUD exercised: a positive crud test targets the form behind the operation.
  const positiveForms = new Set(
    manifest.filter((entry) => entry.category === 'crud' && entry.tier === 'positive' && entry.targetForm && entry.route).map((entry) => `${routeShape(canonicalPath(entry.route ?? '/'))}|${entry.targetForm}`),
  );
  for (const { formKey, route, op } of formOps) {
    if ([...positiveForms].some((covered) => keysAlign(covered, formKey))) markResource(crudExercisedByResource, route, op);
  }
  for (const route of coveredRoutes) markResource(crudExercisedByResource, route, 'read');

  // Declared routes: coverage of the application's own route list, independent of the crawler.
  const expected = config.evaluation.expectedRoutes;
  const loginShape = routeShape(canonicalPath(config.auth.loginPath));
  const hasLoginTest = manifest.some((entry) => entry.category === 'auth');
  const declaredRoutes = expected.length === 0
    ? null
    : ratio(expected.filter((shape) => coveredRoutes.has(shape) || (shape === loginShape && hasLoginTest)).length, expected.length);

  const routes = ratio(intersectionSize(totalRoutes, coveredRoutes), totalRoutes.size);
  const forms = ratio(coveredFormKeys.size, totalForms.size);
  const fields = ratio(coveredFieldCount, totalFields.size);
  const nav = ratio(intersectionSize(navScenarios, coveredNavKeys), navScenarios.size);

  const elementCovered = routes.covered + forms.covered + fields.covered + nav.covered;
  const elementTotal = routes.total + forms.total + fields.total + nav.total;

  const exercisedConstraints = new Set(manifest.map((entry) => entry.constraintKind).filter((kind): kind is string => kind !== null));
  const exercisedPresent = [...exercisedConstraints].filter((kind) => presentConstraints.has(kind));

  return {
    mode: config.mode,
    routes,
    forms,
    fields,
    nav,
    fieldsProbed: ratio(probedFieldCount, totalFields.size),
    declaredRoutes,
    element: ratio(elementCovered, elementTotal),
    rbacMatrix: rbacMatrixCoverage(matrix, manifest, config),
    crudByResource,
    crudExercisedByResource,
    constraintKinds: {
      present: [...presentConstraints].sort(),
      exercised: [...exercisedConstraints].sort(),
      ratio: presentConstraints.size === 0 ? 1 : exercisedPresent.length / presentConstraints.size,
    },
    tiers: tierCounts(manifest),
  };
}

export function rbacMatrixCoverage(matrix: AccessMatrix, manifest: ManifestEntry[], config: TathyaConfig): Ratio {
  const roles = config.auth.roles.map((role) => role.name);
  // Matrix cells are counted per route SHAPE so the one-representative-per-shape emission of the
  // mapper can still reach full coverage (12 per-row edit routes are one cell, not twelve).
  const asserted = new Set(
    manifest
      .filter((entry): entry is ManifestEntry & { route: string } => entry.category === 'rbac' && entry.route !== null)
      .map((entry) => `${entry.role}:${routeShape(canonicalPath(entry.route))}`),
  );
  const shapes = new Set([...matrix.values()].map((entry) => routeShape(canonicalPath(entry.route))));
  let total = 0;
  let covered = 0;
  for (const shape of shapes) {
    for (const role of roles) {
      total += 1;
      if (asserted.has(`${role}:${shape}`)) covered += 1;
    }
  }
  return ratio(covered, total);
}

export function tierCounts(manifest: ManifestEntry[]): CoverageMetrics['tiers'] {
  const tiers = { positive: 0, negative: 0, edge: 0, total: manifest.length };
  for (const entry of manifest) tiers[entry.tier] += 1;
  return tiers;
}
