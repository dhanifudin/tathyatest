import type { CrawlOutput, Field, Form, Locator, PageModel } from '../crawl/model.js';
import type { TathyaConfig } from '../config.js';
import { isLogoutPath } from '../crawl/crud.js';
import { shouldIncludeCoverage } from '../config.js';
import { routeShape, type AccessMatrix } from './rbac.js';
import { variantsForField, validFieldValue, type FieldValue } from './fieldgen.js';
import { canonicalPath, resolveHrefPathAndSearch } from '../util/paths.js';
import { normalizeTitleText } from '../util/text.js';
import { type TestCase, isMutating } from './test-case.js';
import { formTitleSignature, paginationTitle, formLabel, humanVariant, controlLabel } from './titles.js';
import { paginationActionForControl, isPaginationCandidate } from './pagination-labels.js';


/**
 * Variants a browser's own constraint validation blocks before the request leaves the page: on a form
 * without `novalidate` they could never reach the server-side oracle, so they are not generated.
 */
const NATIVELY_UNFALSIFIABLE_VARIANTS = ['maxlength-plus-one', 'invalid-option', 'confirmation-mismatch', 'accept-mismatch'];

/**
 * Turn stored crawls into test intents. The order is part of the contract (test ids in the manifest
 * follow it): auth, then per role and page (route, forms, pagination, interactions), then the
 * inferred REST routes, then RBAC affordances and blocked routes.
 */
export function mapTestCases(crawls: CrawlOutput[], matrix: AccessMatrix, config: TathyaConfig): TestCase[] {
  const cases: TestCase[] = [...authCases(config)];

  // Variant (negative/edge) cases probe server-side validation, which is role-independent:
  // the same form shape reached by two roles is ONE validation scenario, owned by the first
  // role that reaches it. Positives stay per role — the acting role is part of the scenario.
  const scenarios: FormScenarioState = { seenVariants: new Set(), seenLogout: new Set() };
  for (const crawl of crawls) {
    const seenPages = new Set<string>();
    const seenFieldlessForms = new Set<string>();
    const seenFieldForms = new Set<string>();
    const seenInteractions = new Set<string>();
    for (const page of crawl.pages) {
      const canonicalPageUrl = canonicalPath(page.url);
      // Dedupe by route SHAPE: /todos/7/edit and /todos/8/edit are the same scenario with a
      // different row id — one representative page per role covers it.
      const pageKey = `${crawl.role}:${routeShape(canonicalPageUrl)}`;
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);
      cases.push({
        kind: 'rbac',
        tier: 'positive',
        title: `${crawl.role} can open ${canonicalPageUrl}`,
        role: crawl.role,
        route: canonicalPageUrl,
        expectAllowed: true,
      });
      const forms = dedupeForms(crawl.role, page.forms, canonicalPageUrl, seenFieldlessForms, seenFieldForms);
      cases.push(...formCasesForPage(crawl.role, page, canonicalPageUrl, forms, config, scenarios));
      cases.push(...paginationCasesForPage(crawl.role, page, canonicalPageUrl, crawl.baseUrl));
      cases.push(...interactionCasesForPage(crawl.role, page, canonicalPageUrl, crawl.baseUrl, seenInteractions));
    }
    if (config.crawl.inferRestRoutes) cases.push(...inferredShowRouteCases(crawl, seenPages));
  }

  if (shouldIncludeCoverage(config.coverage, 'negative')) {
    cases.push(...affordanceCases(crawls));
    cases.push(...blockedRouteCases(matrix, config));
  }

  // Read-only mode: keep the status sweep (login, route visits, links, pagination, GET forms)
  // and drop everything that writes — safe to point at staging or production.
  return config.mode === 'read-only' ? cases.filter((testCase) => !isMutating(testCase)) : cases;
}

/** Login with valid credentials per role, plus a wrong-password rejection when negatives are on. */
function authCases(config: TathyaConfig): TestCase[] {
  const cases: TestCase[] = [];
  for (const role of config.auth.roles) {
    cases.push({
      kind: 'auth',
      tier: 'positive',
      title: `${role.name} logs in with valid credentials`,
      role: role.name,
      username: role.username,
      password: role.password,
      expectSuccess: true,
    });
    if (shouldIncludeCoverage(config.coverage, 'negative')) {
      cases.push({
        kind: 'auth',
        tier: 'negative',
        title: `${role.name} is rejected with a wrong password`,
        role: role.name,
        username: role.username,
        password: `${role.password}-wrong`,
        expectSuccess: false,
      });
    }
  }
  return cases;
}

/** State shared across roles and pages so one validation scenario or logout is generated once. */
type FormScenarioState = { seenVariants: Set<string>; seenLogout: Set<string> };

/** Form cases of one page: the valid submit, every field variant, logout, and field-less actions. */
function formCasesForPage(
  role: string,
  page: PageModel,
  canonicalPageUrl: string,
  forms: Form[],
  config: TathyaConfig,
  state: FormScenarioState,
): TestCase[] {
  const cases: TestCase[] = [];
  const formSignatureCounts = countBy(forms.map((form) => formTitleSignature(form)));
  const formSignatureOrdinals = new Map<string, number>();
  for (const form of forms) {
    const formSignature = formTitleSignature(form);
    const formOrdinal = (formSignatureOrdinals.get(formSignature) ?? 0) + 1;
    formSignatureOrdinals.set(formSignature, formOrdinal);
    const formTitleBase = formLabel(form, (formSignatureCounts.get(formSignature) ?? 0) > 1 ? formOrdinal : null);
    if (form.fields.length > 0) {
      const baseValues = buildBaseValues(form, config);
      cases.push({
        kind: 'form',
        tier: 'positive',
        title: `${role} · ${canonicalPageUrl} · ${formTitleBase} · submits valid data successfully`,
        role,
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
          // On native (non-novalidate) forms these violations are unfalsifiable end-to-end:
          // constraint validation only fires for user-dirty values, so a programmatic fill of
          // an over-long value or an injected select option never flips validity.valid; a
          // confirmation mismatch is server-side semantics (both fields stay individually
          // valid); and whether the server round-trips a visible error is unknowable at
          // generation time.
          // `accept` is a picker hint, not a constraint the browser validates, so an
          // accept-mismatch is likewise only observable through the app's own error display.
          if (!form.noValidate && NATIVELY_UNFALSIFIABLE_VARIANTS.includes(variant.name)) continue;
          if (!shouldIncludeCoverage(config.coverage, variant.kind)) continue;
          const variantKey = `${routeShape(canonicalPageUrl)}:${formShapeKey(form)}:${field.name}:${variant.name}`;
          if (state.seenVariants.has(variantKey)) continue;
          state.seenVariants.add(variantKey);
          const values = { ...baseValues };
          if (variant.omit) delete values[field.name];
          else values[field.name] = { kind: 'literal', value: variant.value };
          cases.push({
            kind: 'form',
            tier: variant.kind,
            title: `${role} · ${canonicalPageUrl} · ${formTitleBase} · ${humanVariant(field, variant)}`,
            role,
            page,
            form,
            targetField: field,
            variant,
            values,
          });
        }
      }
    } else if (form.crudOp === 'logout') {
      // One logout scenario per role: ending the session is auth behaviour, not a create.
      if (!state.seenLogout.has(role)) {
        state.seenLogout.add(role);
        const credentials = config.auth.roles.find((candidate) => candidate.name === role);
        cases.push({
          kind: 'auth',
          tier: 'positive',
          title: `${role} logs out`,
          role,
          username: credentials?.username ?? '',
          password: credentials?.password ?? '',
          expectSuccess: true,
          logout: { page, form },
        });
      }
    } else {
      cases.push({
        kind: 'form',
        tier: 'positive',
        title: `${role} · ${canonicalPageUrl} · ${formTitleBase} · ${form.crudOp === 'delete' ? 'deletes the record' : 'submits successfully'}`,
        role,
        page,
        form,
        targetField: null,
        variant: { kind: 'positive', name: form.crudOp === 'delete' ? 'delete' : 'valid', value: '', outcome: 'success' },
        values: {},
      });
    }
  }
  return cases;
}

/** Blocked-route negatives from the access matrix: one case per route shape per role. */
function blockedRouteCases(matrix: AccessMatrix, config: TathyaConfig): TestCase[] {
  const cases: TestCase[] = [];
  const roles = config.auth.roles.map((role) => role.name);
  const seenBlockedRoutes = new Set<string>();
  for (const entry of matrix.values()) {
    const route = canonicalPath(entry.route);
    for (const role of roles) {
      if (entry.reachableBy.includes(role)) continue;
      // One blocked case per route shape per role: /todos/1/edit .. /todos/12/edit blocked
      // for "user" is a single ownership scenario, not twelve.
      const key = `${role}:${routeShape(route)}`;
      if (seenBlockedRoutes.has(key)) continue;
      seenBlockedRoutes.add(key);
      cases.push({ kind: 'rbac', tier: 'negative', title: `${role} is blocked from ${route}`, role, route, expectAllowed: false });
    }
  }
  return cases;
}

/**
 * REST convention: `/todos/7/edit` and `DELETE /todos/7` imply a `/todos/7` show route that no
 * page linked to (the crawl only follows links). One allowed-route case per unseen shape.
 */
function inferredShowRouteCases(crawl: CrawlOutput, seenPages: Set<string>): TestCase[] {
  const candidates: { route: string; from: string }[] = [];
  for (const page of crawl.pages) {
    const path = canonicalPath(page.url);
    const edit = /^(.*\/\d+)\/edit\/?$/.exec(path);
    if (edit) candidates.push({ route: edit[1], from: path });
    for (const form of page.forms) {
      if (form.crudOp !== 'delete') continue;
      const action = canonicalPath(form.action).replace(/\/$/, '');
      if (/\/\d+$/.test(action)) candidates.push({ route: action, from: `the delete form on ${path}` });
    }
  }
  const done = new Set<string>();
  const cases: TestCase[] = [];
  for (const candidate of candidates) {
    const key = `${crawl.role}:${routeShape(candidate.route)}`;
    if (seenPages.has(key) || done.has(key)) continue;
    done.add(key);
    cases.push({
      kind: 'rbac',
      tier: 'positive',
      title: `${crawl.role} can open ${candidate.route} (inferred from ${candidate.from})`,
      role: crawl.role,
      route: candidate.route,
      expectAllowed: true,
      inferred: true,
    });
  }
  return cases;
}

/**
 * RBAC at the UI level: on a page shape that several roles reach, a link one role gets and
 * another does not (the admin-only "Users" link in the navbar) must stay absent for the latter.
 * Links only — button labels can legitimately differ per role (the account menu shows the
 * user's name) — and never pagination or logout links.
 */
function affordanceCases(crawls: CrawlOutput[]): TestCase[] {
  type RoleLinks = Map<string, { page: PageModel; links: Map<string, PageModel['links'][number]> }>;
  const byShape = new Map<string, RoleLinks>();
  for (const crawl of crawls) {
    for (const page of crawl.pages) {
      const shape = routeShape(canonicalPath(page.url));
      const roles = byShape.get(shape) ?? new Map();
      if (roles.has(crawl.role)) continue;
      const links = new Map<string, PageModel['links'][number]>();
      for (const link of page.links) {
        const target = resolveHrefPathAndSearch(link.href, crawl.baseUrl);
        if (isPaginationCandidate(link.text, link.locator.value, link.href, page.url, crawl.baseUrl) || isLogoutPath(target)) continue;
        links.set(targetShapeKey(link.href, crawl.baseUrl), link);
      }
      roles.set(crawl.role, { page, links });
      byShape.set(shape, roles);
    }
  }

  // One negative per role and link target: the navbar's admin-only link is the same denial on
  // every page that carries the navbar, so the first page shape that shows the gap owns it.
  const seen = new Set<string>();
  const cases: TestCase[] = [];
  for (const roles of byShape.values()) {
    if (roles.size < 2) continue;
    for (const [role, { page, links }] of roles) {
      for (const [other, otherSide] of roles) {
        if (other === role) continue;
        for (const [key, link] of otherSide.links) {
          if (links.has(key) || seen.has(`${role}|${key}`)) continue;
          seen.add(`${role}|${key}`);
          const target = resolveHrefPathAndSearch(link.href, crawls.find((crawl) => crawl.role === other)?.baseUrl ?? '');
          const label = normalizeTitleText(link.text) || target;
          cases.push({
            kind: 'rbac',
            tier: 'negative',
            title: `${role} does not see the "${label}" link to ${target} on ${canonicalPath(page.url)}`,
            role,
            route: canonicalPath(page.url),
            expectAllowed: false,
            affordance: { label, locator: link.locator, href: link.href, page },
          });
        }
      }
    }
  }
  return cases;
}



/**
 * The nav scenario keys (interaction + pagination) this page contributes, at the same
 * granularity the mapper dedupes by. metrics.ts uses these as the element-coverage
 * denominator so the one-representative-per-scenario emission can still reach full
 * coverage. Kept in lockstep with interactionCasesForPage/paginationCasesForPage by a
 * unit test.
 */
export function navScenarioKeysForPage(page: PageModel, baseUrl: string): string[] {
  const keys: string[] = [];
  const pageShape = routeShape(canonicalPath(page.url));
  const formSubmitLocators = new Set(page.forms.map((form) => locatorKey(form.submit.locator)));
  for (const link of page.links) {
    const action = paginationActionForControl(link.text, link.locator.value, link.href, page.url, baseUrl);
    keys.push(action ? `pagination:${pageShape}:${action}` : `link:${targetShapeKey(link.href, baseUrl)}`);
  }
  for (const button of page.buttons) {
    if (formSubmitLocators.has(locatorKey(button.locator))) continue;
    const action = paginationActionForControl(button.text, button.locator.value, undefined, page.url, baseUrl);
    keys.push(action ? `pagination:${pageShape}:${action}` : `button:${button.text || locatorKey(button.locator)}`);
  }
  for (const control of page.controls ?? []) {
    keys.push(`select:${locatorKey(control.locator)}`);
  }
  return keys;
}

// The seen-set is shared across a role's pages: the navbar link on every page, or ten
// per-row edit links, are one navigation scenario each — keyed by a full target signature
// (route shape with numeric segments -> :id, plus every query key=value pair sorted), so
// /todos?status=done and /todos?status=pending are distinct scenarios, not just distinct
// from bare /todos. Pagination links/buttons are classified and routed to
// paginationCasesForPage before reaching this function (see isPaginationCandidate below),
// so they are exempt from this signature and keep their own one-representative-per-action
// dedup instead of one case per page number.
function interactionCasesForPage(role: string, page: PageModel, canonicalPageUrl: string, baseUrl: string, seen: Set<string>): TestCase[] {
  const cases: TestCase[] = [];
  const formSubmitLocators = new Set(page.forms.map((form) => locatorKey(form.submit.locator)));
  // Visible-first (stable sort): when a hidden responsive duplicate shares a scenario key
  // with a visible control, the visible one becomes the representative.
  const orderedLinks = [...page.links].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));
  const orderedButtons = [...page.buttons].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));

  // A logout link next to a logout form (Breeze's anchor that submits the hidden form) is the
  // same scenario as the auth logout case; without such a form the link stays an interaction.
  const hasLogoutForm = page.forms.some((form) => form.crudOp === 'logout');
  for (const link of orderedLinks) {
    // Title carries the query too: /todos and /todos?status=done are distinct scenarios
    // (different dedup keys) and must not share a title.
    const target = resolveHrefPathAndSearch(link.href, baseUrl);
    if (isPaginationCandidate(link.text, link.locator.value, link.href, page.url, baseUrl)) continue;
    if (hasLogoutForm && isLogoutPath(target)) continue;
    const key = `link:${targetShapeKey(link.href, baseUrl)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({
      kind: 'interaction',
      tier: 'positive',
      title: `${role} · ${canonicalPageUrl} · follows the ${link.text ? `"${normalizeTitleText(link.text)}" link` : 'link'} to ${target}`,
      role,
      page,
      interaction: {
        type: 'link',
        label: link.text || target,
        locator: link.locator,
        ordinal: 0,
        href: link.href,
      },
    });
  }

  for (const button of orderedButtons) {
    const label = button.text || `${button.locator.strategy}:${button.locator.value}`;
    if (formSubmitLocators.has(locatorKey(button.locator))) continue;
    if (isPaginationCandidate(button.text, button.locator.value, undefined, page.url, baseUrl)) continue;
    const key = `button:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({
      kind: 'interaction',
      tier: 'positive',
      title: `${role} · ${canonicalPageUrl} · clicks the "${label}" button`,
      role,
      page,
      interaction: {
        type: 'button',
        label,
        locator: button.locator,
        ordinal: 0,
      },
    });
  }

  // Orphan select controls (e.g. sort dropdowns in SPAs). Emit one interaction per select,
  // choosing a representative non-empty option (last option with a non-empty value).
  for (const control of page.controls ?? []) {
    const label = `${control.locator.strategy}:${control.locator.value}`;
    const key = `select:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const options = control.options ?? [];
    const representative = [...options].reverse().find((opt) => opt.value !== '') ?? options[0];
    cases.push({
      kind: 'interaction',
      tier: 'positive',
      title: `${role} · ${canonicalPageUrl} · selects ${representative ? `"${representative.label || representative.value}"` : 'an option'} in the ${label} control`,
      role,
      page,
      interaction: {
        type: 'select',
        label,
        locator: control.locator,
        ordinal: 0,
        optionValue: representative?.value,
      },
    });
  }

  return cases;
}

function dedupeForms(
  role: string,
  forms: Form[],
  canonicalPageUrl: string,
  seenFieldlessForms: Set<string>,
  seenFieldForms: Set<string>,
): Form[] {
  const out: Form[] = [];
  for (const form of forms) {
    const key = form.fields.length === 0
      ? `${role}:fieldless:${formShapeKey(form)}`
      : `${role}:fields:${routeShape(canonicalPageUrl)}:${formShapeKey(form)}`;
    const seen = form.fields.length === 0 ? seenFieldlessForms : seenFieldForms;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(form);
  }
  return out;
}

function formShapeKey(form: Form): string {
  return [
    routeShape(canonicalPath(form.action)),
    form.method,
    form.crudOp,
    normalizeTitleText(form.submit.text),
    form.fields.map((field) => fieldShapeKey(field)).join('|'),
  ].join(';');
}

function fieldShapeKey(field: Field): string {
  return [
    field.name,
    field.type,
    field.required ? 'required' : 'optional',
    field.options?.map((option) => option.value).join(',') ?? '',
  ].join(':');
}

function locatorKey(locator: Locator): string {
  return `${locator.strategy}:${locator.value}`;
}

function paginationCasesForPage(role: string, page: PageModel, canonicalPageUrl: string, baseUrl: string): TestCase[] {
  type PaginationAction = 'first' | 'previous' | 'next' | 'last' | 'page';
  type PaginationCandidate =
    | { type: 'link'; label: string; locator: Locator; href: string; action: PaginationAction | null }
    | { type: 'button'; label: string; locator: Locator; action: PaginationAction | null };
  type PaginationControl =
    | { type: 'link'; label: string; locator: Locator; href: string; action: PaginationAction }
    | { type: 'button'; label: string; locator: Locator; action: PaginationAction };

  const candidates: (PaginationCandidate & { visible: boolean })[] = [
    ...page.links.map((link) => ({
      type: 'link' as const,
      label: controlLabel(link.text, link.locator.value),
      locator: link.locator,
      href: link.href,
      action: paginationActionForControl(link.text, link.locator.value, link.href, page.url, baseUrl),
      visible: link.visible !== false,
    })),
    ...page.buttons.map((button) => ({
      type: 'button' as const,
      label: controlLabel(button.text, button.locator.value),
      locator: button.locator,
      action: paginationActionForControl(button.text, button.locator.value, undefined, page.url, baseUrl),
      visible: button.visible !== false,
    })),
  ];

  // Visible-first (stable): responsive layouts ship a hidden mobile paginator next to the
  // desktop one; the representative control per action must be clickable at test viewport.
  const paginationControls: PaginationControl[] = candidates
    .sort((a, b) => Number(b.visible) - Number(a.visible))
    .flatMap((control) =>
      control.action ? [{ ...control, action: control.action }] as PaginationControl[] : [],
    );
  // One representative per action: jumping to page 2 and page 3 is the same numbered-jump
  // scenario, and mobile/desktop duplicates of the same arrow collapse too.
  const seen = new Set<string>();
  const cases: TestCase[] = [];

  for (const control of paginationControls) {
    if (seen.has(control.action)) continue;
    seen.add(control.action);
    cases.push({
      kind: 'pagination',
      tier: 'positive',
      title: paginationTitle(role, canonicalPageUrl, control.action, control.label),
      role,
      page,
      pagination: {
        type: control.type,
        label: control.label,
        locator: control.locator,
        ordinal: 0,
        href: control.type === 'link' ? control.href : undefined,
        action: control.action,
      },
    });
  }

  return cases;
}




















// Full target signature used to decide whether two links/buttons are the same test
// scenario: route shape (numeric path segments -> :id) plus every query key=value pair,
// sorted for determinism. Query VALUES matter here — ?status=done and ?status=pending are
// different data scenarios, not duplicates. (Pagination links are classified and routed
// to paginationCasesForPage before reaching this function — see isPaginationCandidate —
// so they never use this signature.)
function targetShapeKey(href: string, baseUrl: string): string {
  const [pathname = '/', search = ''] = resolveHrefPathAndSearch(href, baseUrl).split('?', 2);
  const params = [...new URLSearchParams(search).entries()].sort(([ak, av], [bk, bv]) =>
    ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk),
  );
  return params.length > 0
    ? `${routeShape(pathname)}?${params.map(([key, value]) => `${key}=${value}`).join('&')}`
    : routeShape(pathname);
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}


function buildBaseValues(form: Form, config: TathyaConfig): Record<string, FieldValue> {
  const hints = {
    dataFields: config.data.fields,
    defaults: config.data.defaults,
    unique: config.data.unique,
    duplicates: config.data.duplicates,
    requiredFields: config.data.requiredFields,
    confirmFields: config.data.confirmFields,
  };
  const names = new Set(form.fields.map((field) => field.name));
  const values: Record<string, FieldValue> = {};
  for (const field of form.fields) {
    const sourceName = confirmationSourceName(field);
    if (sourceName && names.has(sourceName)) {
      values[field.name] = { kind: 'ref', name: sourceName };
    } else {
      values[field.name] = validFieldValue(field, hints);
    }
  }
  return values;
}

function confirmationSourceName(field: Field): string | null {
  if (field.name.endsWith('_confirmation')) {
    return field.name.slice(0, -'_confirmation'.length);
  }
  return null;
}
