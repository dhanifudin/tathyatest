import type { Locator as PlaywrightLocator, Page } from '@playwright/test';
import type { Locator } from './model.js';
import type { DomPageModel } from './dom-extract.js';

/**
 * A locator as the DOM pass leaves it. `probe` is the `data-tt-probe` value of its element,
 * `fallback` the CSS locator to use if a role name turns out wrong, and `unique` whether a CSS
 * value matches only this element. None of the three is part of the crawl contract.
 */
export type RawLocator = Locator & { probe?: number; fallback?: RawLocator; unique?: boolean };

/** Roles an element may be located by once Playwright reports an accessible name for it. */
const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'spinbutton', 'slider', 'menuitem', 'tab']);

/**
 * Check every probed locator against Playwright's own accessibility tree, element by element: a
 * role name read from the DOM must really be the element's accessible name, and a weak (`css` or
 * `name`) locator is upgraded to `role:name` when the element has one. Buttons and links left
 * with a CSS selector matching several elements are dropped — a test could not address them.
 */
export async function enrichAccessibility(page: Page, model: DomPageModel): Promise<DomPageModel> {
  const refine = (locator: Locator) => refineLocator(page, locator as RawLocator);
  const forms: DomPageModel['forms'] = [];
  for (const form of model.forms) {
    const fields: DomPageModel['forms'][number]['fields'] = [];
    for (const field of form.fields) {
      const { locator, name } = await refine(field.locator);
      fields.push({ ...field, label: field.label ?? name, locator: strip(locator) });
    }
    const submit = await refine(form.submit.locator);
    forms.push({ ...form, fields, submit: { text: form.submit.text ?? submit.name, locator: strip(submit.locator) } });
  }
  const addressable = async <T extends { locator: Locator }>(items: T[]): Promise<T[]> => {
    const kept: T[] = [];
    for (const item of items) {
      const { locator } = await refine(item.locator);
      if (!(locator.strategy === 'css' && locator.unique === false)) kept.push({ ...item, locator: strip(locator) });
    }
    return kept;
  };
  const buttons = await addressable(model.buttons);
  const links = await addressable(model.links);
  const controls: NonNullable<DomPageModel['controls']> = [];
  for (const control of model.controls ?? []) controls.push({ ...control, locator: strip((await refine(control.locator)).locator) });
  await page.evaluate(() => document.querySelectorAll('[data-tt-probe]').forEach((el) => el.removeAttribute('data-tt-probe')));
  return { ...model, forms, buttons, links, controls };
}

type Refined = { locator: RawLocator; name: string | null };

async function refineLocator(page: Page, locator: RawLocator): Promise<Refined> {
  if (locator.probe === undefined) return { locator, name: null };
  const element = page.locator(`[data-tt-probe="${locator.probe}"]`);
  if (locator.strategy === 'role') {
    const [role, ...nameParts] = locator.value.split(':');
    if (await hasRoleName(page, element, role ?? '', nameParts.join(':'))) return { locator, name: null };
  }
  const node = await accessibleNode(element);
  if (node && await hasRoleName(page, element, node.role, node.name)) {
    return { locator: { strategy: 'role', value: `${node.role}:${node.name}` }, name: node.name };
  }
  // A wrong role name is worse than a plain selector. A hidden element exposes no snapshot, so its
  // name cannot be corrected: it falls back too.
  return { locator: locator.strategy === 'role' ? locator.fallback ?? locator : locator, name: null };
}

async function hasRoleName(page: Page, element: PlaywrightLocator, role: string, name: string): Promise<boolean> {
  // The name a test will see: hidden descendants count only when the element itself is hidden
  // (a closed menu), where nothing but a hidden-inclusive query can reach it.
  const includeHidden = !(await element.isVisible().catch(() => false));
  const byRole = page.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: true, includeHidden });
  return (await byRole.and(element).count().catch(() => 0)) === 1;
}

/** The element's own role and accessible name: the first line of its accessibility snapshot. */
async function accessibleNode(element: PlaywrightLocator): Promise<{ role: string; name: string } | null> {
  const snapshot = await element.ariaSnapshot({ timeout: 2000 }).catch(() => '');
  return parseAriaNode(snapshot.split('\n')[0] ?? '');
}

/** `- button "Save"`, `- checkbox "Done" [checked]`, `- textbox "Title": value`, `- link "Home":`. */
export function parseAriaNode(line: string): { role: string; name: string } | null {
  const match = /^\s*-\s+'?([a-z][\w-]*)\s+"((?:[^"\\]|\\.)*)"/i.exec(line);
  if (!match) return null;
  const role = (match[1] ?? '').toLowerCase();
  const name = unquote(match[2] ?? '').trim();
  return NAMED_ROLES.has(role) && name !== '' ? { role, name } : null;
}

function unquote(value: string): string {
  return value.replace(/\\(["\\])/g, '$1');
}

function strip(locator: RawLocator): Locator {
  return { strategy: locator.strategy, value: locator.value };
}
