import type { Page } from '@playwright/test';
import type { Locator } from './model.js';
import type { DomPageModel } from './dom-extract.js';

export async function enrichAccessibility(page: Page, model: DomPageModel): Promise<DomPageModel> {
  const pageNodes = parseAriaSnapshot(await page.ariaSnapshot({ mode: 'default' }).catch(() => ''));

  const buttons = collectRoleNodes(pageNodes, ['button']);
  const links = collectRoleNodes(pageNodes, ['link']);

  const formCount = await page.locator('form').count();
  for (let formIndex = 0; formIndex < Math.min(formCount, model.forms.length); formIndex += 1) {
    const formSnapshot = await page.locator('form').nth(formIndex).ariaSnapshot({ mode: 'default' }).catch(() => '');
    const formNodes = collectRoleNodes(parseAriaSnapshot(formSnapshot), ['textbox', 'combobox', 'checkbox', 'radio', 'spinbutton', 'button']);
    const form = model.forms[formIndex];
    for (let fieldIndex = 0; fieldIndex < Math.min(form.fields.length, formNodes.length); fieldIndex += 1) {
      const node = formNodes[fieldIndex];
      form.fields[fieldIndex] = mergeAccessibleField(form.fields[fieldIndex], node);
    }
    const submitNode = formNodes.find((node) => node.role === 'button') ?? null;
    if (submitNode) {
      form.submit = mergeAccessibleSubmit(form.submit, submitNode);
    }
  }

  model.buttons = model.buttons.map((button, index) => mergeAccessibleButton(button, buttons[index]));
  model.links = model.links.map((link, index) => mergeAccessibleLink(link, links[index]));
  return model;
}

type AccessibleNode = { role: string; name: string };

function parseAriaSnapshot(snapshot: string): AccessibleNode[] {
  if (snapshot.trim() === '') return [];
  const out: AccessibleNode[] = [];
  for (const line of snapshot.split('\n')) {
    const match = line.trim().match(/^-\s+([a-z][a-z0-9_-]*)(?:\s+"([^"]+)")?:\s*$/i);
    if (!match) continue;
    const role = match[1].toLowerCase();
    const name = match[2]?.trim() ?? '';
    if (name === '') continue;
    out.push({ role, name });
  }
  return out;
}

function collectRoleNodes(nodes: AccessibleNode[], roles: string[]): AccessibleNode[] {
  return nodes.filter((node) => roles.includes(node.role));
}

/** Locator strategies that already satisfy the priority chain; the accessibility pass never replaces them. */
const PRESERVED_STRATEGIES = new Set<Locator['strategy']>(['testid', 'label', 'placeholder']);

/**
 * Upgrade a weak (`css` or `name`) locator to `role:name` using the accessibility snapshot node.
 * Returns null when the element must stay untouched (it already has a strong locator, or the node's
 * role is unusable); an `id` locator is kept as is.
 */
function accessibleLocator(locator: Locator, node: AccessibleNode, fallbackRole: string): Locator | null {
  if (PRESERVED_STRATEGIES.has(locator.strategy)) return null;
  const role = normalizeAccessibleRole(node.role, fallbackRole);
  if (!role) return null;
  return locator.strategy === 'css' || locator.strategy === 'name' ? { strategy: 'role', value: `${role}:${node.name}` } : locator;
}

type DomForm = DomPageModel['forms'][number];

function mergeAccessibleField(field: DomForm['fields'][number], node?: AccessibleNode): DomForm['fields'][number] {
  const locator = node && accessibleLocator(field.locator, node, field.type);
  return node && locator ? { ...field, label: field.label ?? node.name, locator } : field;
}

function mergeAccessibleSubmit(submit: DomForm['submit'], node?: AccessibleNode): DomForm['submit'] {
  const locator = node && accessibleLocator(submit.locator, node, 'button');
  return node && locator ? { ...submit, text: submit.text ?? node.name, locator } : submit;
}

function mergeAccessibleButton(button: DomPageModel['buttons'][number], node?: AccessibleNode): DomPageModel['buttons'][number] {
  const locator = node && accessibleLocator(button.locator, node, 'button');
  return locator ? { ...button, locator } : button;
}

function mergeAccessibleLink(link: DomPageModel['links'][number], node?: AccessibleNode): DomPageModel['links'][number] {
  const locator = node && accessibleLocator(link.locator, node, 'link');
  return locator ? { ...link, locator } : link;
}

function normalizeAccessibleRole(role: string, fallback: string): string {
  if (role === 'searchbox') return 'textbox';
  if (role === 'textbox' || role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio' || role === 'combobox' || role === 'spinbutton') {
    return role;
  }
  return fallback;
}
