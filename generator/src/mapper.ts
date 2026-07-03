import type { CrawlOutput, Field, Form, Locator, PageModel } from './crawl.js';
import type { TathyaConfig } from './config.js';
import { shouldIncludeCoverage } from './config.js';
import { routeShape, type AccessMatrix } from './rbac.js';
import { variantsForField, validFieldValue, type FieldValue, type FieldVariant } from './fieldgen.js';

export type TestCaseKind = 'auth' | 'form' | 'interaction' | 'pagination' | 'rbac';
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
      values: Record<string, FieldValue>;
    }
  | {
      kind: 'interaction';
      tier: 'positive';
      title: string;
      role: string;
      page: PageModel;
      interaction: {
        type: 'link' | 'button' | 'select';
        label: string;
        locator: Locator;
        ordinal: number;
        href?: string;
        /** For type === 'select': the option value to select (a representative non-empty option). */
        optionValue?: string;
      };
    }
  | {
      kind: 'pagination';
      tier: 'positive';
      title: string;
      role: string;
      page: PageModel;
      pagination: {
        type: 'link' | 'button';
        label: string;
        locator: Locator;
        ordinal: number;
        href?: string;
        action: 'first' | 'previous' | 'next' | 'last' | 'page';
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

  // Variant (negative/edge) cases probe server-side validation, which is role-independent:
  // the same form shape reached by two roles is ONE validation scenario, owned by the first
  // role that reaches it. Positives stay per role — the acting role is part of the scenario.
  const seenVariants = new Set<string>();
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
        title: `${crawl.role} can visit ${canonicalPageUrl} -> allowed`,
        role: crawl.role,
        route: canonicalPageUrl,
        expectAllowed: true,
      });
      const forms = dedupeForms(crawl.role, page.forms, canonicalPageUrl, seenFieldlessForms, seenFieldForms);
      const formSignatureCounts = countBy(forms.map((form) => formTitleSignature(form)));
      const formSignatureOrdinals = new Map<string, number>();
      for (const form of forms) {
        const formSignature = formTitleSignature(form);
        const formOrdinal = (formSignatureOrdinals.get(formSignature) ?? 0) + 1;
        formSignatureOrdinals.set(formSignature, formOrdinal);
        const formTitleBase = formSignatureCounts.get(formSignature)! > 1 ? `${formSignature} #${formOrdinal}` : formSignature;
        if (form.fields.length > 0) {
          const baseValues = buildBaseValues(form, config);
          cases.push({
            kind: 'form',
            tier: 'positive',
            title: `${crawl.role} ${canonicalPageUrl} ${formTitleBase} - valid -> success`,
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
              // On native (non-novalidate) forms these violations are unfalsifiable end-to-end:
              // constraint validation only fires for user-dirty values, so a programmatic fill of
              // an over-long value or an injected select option never flips validity.valid; a
              // confirmation mismatch is server-side semantics (both fields stay individually
              // valid); and whether the server round-trips a visible error is unknowable at
              // generation time.
              const nativeUnfalsifiable = ['maxlength-plus-one', 'invalid-option', 'confirmation-mismatch'];
              if (!form.noValidate && nativeUnfalsifiable.includes(variant.name)) continue;
              if (!shouldIncludeCoverage(config.coverage, variant.kind)) continue;
              const variantKey = `${routeShape(canonicalPageUrl)}:${formShapeKey(form)}:${field.name}:${variant.name}`;
              if (seenVariants.has(variantKey)) continue;
              seenVariants.add(variantKey);
              const values = { ...baseValues };
              if (variant.omit) delete values[field.name];
              else values[field.name] = { kind: 'literal', value: variant.value };
              cases.push({
                kind: 'form',
                tier: variant.kind,
                title: `${crawl.role} ${canonicalPageUrl} ${formTitleBase} - ${field.name} ${variant.name} -> ${variant.outcome}`,
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
            title: `${crawl.role} ${canonicalPageUrl} ${formTitleBase} -> success`,
            role: crawl.role,
            page,
            form,
            targetField: null,
            variant: { kind: 'positive', name: form.crudOp === 'delete' ? 'delete' : 'valid', value: '', outcome: 'success' },
            values: {},
          });
        }
      }
      cases.push(...paginationCasesForPage(crawl.role, page, canonicalPageUrl, crawl.baseUrl));
      cases.push(...interactionCasesForPage(crawl.role, page, canonicalPageUrl, crawl.baseUrl, seenInteractions));
    }
  }

  if (shouldIncludeCoverage(config.coverage, 'negative')) {
    const roles = config.auth.roles.map((role) => role.name);
    const seenBlockedRoutes = new Set<string>();
    for (const entry of matrix.values()) {
      const route = canonicalPath(entry.route);
      for (const role of roles) {
        if (!entry.reachableBy.includes(role)) {
          // One blocked case per route shape per role: /todos/1/edit .. /todos/12/edit blocked
          // for "user" is a single ownership scenario, not twelve.
          const key = `${role}:${routeShape(route)}`;
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
// per-row edit links, are one navigation scenario each — keyed by target shape (numeric
// segments -> :id, query VALUES dropped but query KEYS kept, so /todos?status=... filter
// links stay distinct from bare /todos).
function interactionCasesForPage(role: string, page: PageModel, canonicalPageUrl: string, baseUrl: string, seen: Set<string>): TestCase[] {
  const cases: TestCase[] = [];
  const formSubmitLocators = new Set(page.forms.map((form) => locatorKey(form.submit.locator)));
  // Visible-first (stable sort): when a hidden responsive duplicate shares a scenario key
  // with a visible control, the visible one becomes the representative.
  const orderedLinks = [...page.links].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));
  const orderedButtons = [...page.buttons].sort((a, b) => Number(b.visible !== false) - Number(a.visible !== false));

  for (const link of orderedLinks) {
    // Title carries the query too: /todos and /todos?status=done are distinct scenarios
    // (different dedup keys) and must not share a title.
    const target = resolveHrefPathAndSearch(link.href, baseUrl);
    if (isPaginationCandidate(link.text, link.locator.value, link.href, page.url, baseUrl)) continue;
    const key = `link:${targetShapeKey(link.href, baseUrl)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({
      kind: 'interaction',
      tier: 'positive',
      title: `${role} ${canonicalPageUrl} link ${target} -> handled`,
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
      title: `${role} ${canonicalPageUrl} button ${label} -> handled`,
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
      title: `${role} ${canonicalPageUrl} select ${label} -> handled`,
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
    const titleBase = paginationTitleBase(role, canonicalPageUrl, control.action, control.label);
    cases.push({
      kind: 'pagination',
      tier: 'positive',
      title: `${titleBase} -> handled`,
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

function formTitleSignature(form: Form): string {
  const parts = [`action ${canonicalPath(form.action)}`, `method ${form.method}`];
  const submitText = normalizeTitleText(form.submit.text);
  if (submitText) parts.push(`submit ${submitText}`);
  if (form.fields.length > 0) parts.push(`fields ${form.fields.map((field) => field.name).join(',')}`);
  return `form [${parts.join('; ')}]`;
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


function paginationTitleBase(role: string, canonicalPageUrl: string, action: 'first' | 'previous' | 'next' | 'last' | 'page', label: string): string {
  return action === 'page'
    ? `${role} ${canonicalPageUrl} pagination page ${label}`
    : `${role} ${canonicalPageUrl} pagination ${action}`;
}

function controlLabel(text: string | null, fallback: string): string {
  return normalizeTitleText(text) || fallback;
}

function paginationActionForControl(
  text: string | null,
  fallback: string,
  href: string | undefined,
  currentPageUrl: string,
  baseUrl: string,
): 'first' | 'previous' | 'next' | 'last' | 'page' | null {
  const label = normalizePaginationLabel(text || fallback);
  const target = href ? resolveHrefPathAndSearch(href, baseUrl) : null;
  const current = resolveHrefPathAndSearch(currentPageUrl, baseUrl);
  // ?page=1 is the default page: a "1" link on /todos points at the page we are already on
  // (some paginators link the current page too) and exercises nothing.
  if (target && current && stripDefaultPageQuery(target) === stripDefaultPageQuery(current)) return null;
  if (isPreviousLabel(label)) return 'previous';
  if (isNextLabel(label)) return 'next';
  if (isFirstLabel(label)) return 'first';
  if (isLastLabel(label)) return 'last';
  if (isPageLabel(label)) return 'page';
  if (target && hasPaginationQuery(target)) return 'page';
  return null;
}

function isPaginationCandidate(text: string | null, fallback: string, href: string | undefined, currentPageUrl: string, baseUrl: string): boolean {
  return paginationActionForControl(text, fallback, href, currentPageUrl, baseUrl) !== null;
}

function normalizePaginationLabel(text: string): string {
  // Paginators decorate word labels with arrows ("Next »", "« Previous"); strip the
  // decoration so the action classifies, but keep pure-symbol labels ("«") intact.
  const label = normalizeTitleText(text).toLowerCase();
  return /[a-z0-9]/.test(label) ? label.replace(/[«»‹›←→<>]/g, '').trim() : label;
}

function isPreviousLabel(label: string): boolean {
  return /^(previous|prev|older|‹|«|<|←)$/i.test(label);
}

function isNextLabel(label: string): boolean {
  return /^(next|newer|›|»|>|→)$/i.test(label);
}

function isFirstLabel(label: string): boolean {
  return /^(first|<<)$/i.test(label);
}

function isLastLabel(label: string): boolean {
  return /^(last|>>)$/i.test(label);
}

function isPageLabel(label: string): boolean {
  return /^page\s+\d+$/i.test(label) || /^\d+$/.test(label);
}

function stripDefaultPageQuery(pathAndSearch: string): string {
  const [pathname = '/', search = ''] = pathAndSearch.split('?', 2);
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (/^(page|p|pageNo|pageNum|pageNumber)$/i.test(key) && params.get(key) === '1') params.delete(key);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function hasPaginationQuery(targetPathAndSearch: string): boolean {
  const query = targetPathAndSearch.split('?', 2)[1] ?? '';
  if (!query) return false;
  const params = new URLSearchParams(query);
  return [...params.keys()].some((key) => /^(page|p|pageNo|pageNum|pageNumber|offset|start|cursor|after|before|limit)$/i.test(key));
}

function targetShapeKey(href: string, baseUrl: string): string {
  const [pathname = '/', search = ''] = resolveHrefPathAndSearch(href, baseUrl).split('?', 2);
  const queryKeys = [...new Set([...new URLSearchParams(search).keys()])].sort();
  return queryKeys.length > 0 ? `${routeShape(pathname)}?${queryKeys.join(',')}` : routeShape(pathname);
}

function resolveHrefPathAndSearch(path: string, baseUrl: string): string {
  try {
    const url = new URL(path, baseUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    const [withoutHash] = path.split('#', 1);
    const [pathname = '/', search = ''] = withoutHash.split('?', 2);
    return `${pathname || '/'}${search ? `?${search}` : ''}`;
  }
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function normalizeTitleText(text: string | null): string {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
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
