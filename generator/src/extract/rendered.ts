import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { CrawlOutput, FieldConstraints, Locator, PageModel } from '../crawl.js';
import type { TathyaConfig } from '../config.js';

type DomPageModel = Omit<PageModel, 'url'>;

export async function renderedCrawl(config: TathyaConfig): Promise<void> {
  await mkdir('crawl', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of config.auth.roles) {
      const page = await browser.newPage({ baseURL: config.baseUrl });
      await login(page, config, role.username, role.password);
      const output = await crawlRole(page, config, role.name);
      await writeFile(join('crawl', `${role.name}.json`), `${JSON.stringify(output, null, 2)}\n`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function login(page: Page, config: TathyaConfig, username: string, password: string): Promise<void> {
  await page.goto(config.auth.loginPath);
  await page.locator(`[name="${config.auth.usernameField}"]`).fill(username);
  await page.locator(`[name="${config.auth.passwordField}"]`).fill(password);
  await page.getByRole('button', { name: /log in|login|sign in/i }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function crawlRole(page: Page, config: TathyaConfig, role: string): Promise<CrawlOutput> {
  const queue = uniquePaths(['/', ...config.crawl.include]);
  const seen = new Set<string>();
  const pages: PageModel[] = [];

  for (let depth = 0; queue.length > 0 && pages.length < config.crawl.maxPages && depth <= config.crawl.maxDepth;) {
    const path = queue.shift();
    if (!path || seen.has(path) || excluded(path, config)) continue;
    seen.add(path);
    const response = await page.goto(path);
    if (!response?.ok()) continue;
    await page.waitForLoadState('domcontentloaded');
    const model = await extractPage(page);
    pages.push({ url: normalizePath(page.url(), config.baseUrl), ...model });
    for (const link of model.links) {
      if (!seen.has(link.href) && !excluded(link.href, config)) queue.push(link.href);
    }
    depth = Math.max(depth, path.split('/').filter(Boolean).length);
  }

  return {
    baseUrl: config.baseUrl,
    engine: 'rendered',
    role,
    crawledAt: new Date().toISOString(),
    pages,
  };
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim() !== ''))];
}

function excluded(path: string, config: TathyaConfig): boolean {
  if (config.crawl.exclude.some((prefix) => path.startsWith(prefix))) return true;
  if (config.crawl.include.length === 0 || path === '/') return false;
  return !config.crawl.include.some((prefix) => path.startsWith(prefix));
}

async function extractPage(page: Page): Promise<DomPageModel> {
  const model = await page.evaluate(() => {
    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const attr = (el: Element, name: string): string | null => el.getAttribute(name);
    const stableId = (value: string | null): string | null => value && !/[0-9a-f]{8,}|:/.test(value) ? value : null;
    const cssEscape = (value: string): string => {
      const escaper = (globalThis as typeof globalThis & { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
      return escaper ? escaper(value) : value.replace(/["\\]/g, '\\$&');
    };
    const inferredRole = (el: Element): string => {
      switch (el.tagName.toLowerCase()) {
        case 'button':
          return 'button';
        case 'textarea':
          return 'textbox';
        case 'select':
          return 'combobox';
        case 'a':
          return attr(el, 'href') ? 'link' : '';
        case 'input': {
          switch ((attr(el, 'type') ?? 'text').toLowerCase()) {
            case 'button':
            case 'submit':
            case 'reset':
            case 'image':
              return 'button';
            case 'checkbox':
              return 'checkbox';
            case 'radio':
              return 'radio';
            case 'number':
              return 'spinbutton';
            default:
              return 'textbox';
          }
        }
        default:
          return '';
      }
    };
    const cssFallback = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const id = attr(el, 'id');
      if (stableId(id)) return `#${cssEscape(id!)}`;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const parentId = attr(parent, 'id');
        if (stableId(parentId)) return `#${cssEscape(parentId!)} ${tag}`;
        const parentTestId = attr(parent, 'data-testid');
        if (parentTestId) return `[data-testid="${parentTestId.replace(/["\\]/g, '\\$&')}"] ${tag}`;
        if (parent.tagName.toLowerCase() === 'html') break;
      }
      return tag;
    };
    const locatorFor = (el: Element, fallbackRole?: string): Locator => {
      const testid = attr(el, 'data-testid');
      if (testid) return { strategy: 'testid', value: testid };
      const name = attr(el, 'aria-label') ?? text(el);
      const role = fallbackRole ?? inferredRole(el);
      if (role && name) {
        const explicitRole = role === 'button' || role === 'link' || attr(el, 'aria-label') !== null;
        if (explicitRole) return { strategy: 'role', value: `${role}:${name}` };
      }
      const id = attr(el, 'id');
      if (id) {
        const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
        if (label && text(label)) return { strategy: 'label', value: text(label) };
      }
      const wrappingLabel = el.closest('label');
      if (wrappingLabel && text(wrappingLabel)) return { strategy: 'label', value: text(wrappingLabel) };
      const placeholder = attr(el, 'placeholder');
      if (placeholder) return { strategy: 'placeholder', value: placeholder };
      const sid = stableId(id);
      if (sid) return { strategy: 'id', value: sid };
      const nameAttr = attr(el, 'name');
      if (nameAttr) return { strategy: 'name', value: nameAttr };
      return { strategy: 'css', value: cssFallback(el) };
    };
    const constraintsFor = (el: Element): FieldConstraints => ({
      minlength: el.getAttribute('minlength') === null ? null : Number(el.getAttribute('minlength')),
      maxlength: el.getAttribute('maxlength') === null ? null : Number(el.getAttribute('maxlength')),
      min: el.getAttribute('min'),
      max: el.getAttribute('max'),
      step: el.getAttribute('step'),
      pattern: el.getAttribute('pattern'),
      inputmode: el.getAttribute('inputmode'),
      accept: el.getAttribute('accept'),
    });
    const normalizeHref = (href: string): string => {
      const url = new URL(href, location.href);
      return url.origin === location.origin ? `${url.pathname}${url.search}` : '';
    };
    const crudFor = (form: HTMLFormElement): 'create' | 'update' | 'delete' | 'unknown' => {
      const method = form.querySelector<HTMLInputElement>('input[name="_method"]')?.value.toUpperCase();
      if (method === 'PUT' || method === 'PATCH') return 'update';
      if (method === 'DELETE') return 'delete';
      if ((form.method || 'GET').toUpperCase() === 'POST') return 'create';
      return 'unknown';
    };
    return {
      title: document.title,
      forms: Array.from(document.querySelectorAll('form')).map((form) => {
        const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
          .filter((field) => field.name && field.type !== 'hidden' && field.type !== 'submit' && field.type !== 'button')
          .map((field) => {
            const options = field instanceof HTMLSelectElement
              ? Array.from(field.options).map((option) => ({ value: option.value, label: text(option) }))
              : null;
            const nameHints = field.name.endsWith('_confirmation') ? ['confirmation'] : [];
            return {
              name: field.name,
              type: field instanceof HTMLTextAreaElement ? 'textarea' : field instanceof HTMLSelectElement ? 'select' : field.type || 'text',
              label: locatorFor(field).strategy === 'label' ? locatorFor(field).value : null,
              required: field.required,
              constraints: constraintsFor(field),
              options,
              nameHints,
              locator: locatorFor(field),
            };
          });
        const submit = form.querySelector<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"], button:not([type])');
        const action = new URL(form.action || location.href, location.href);
        return {
          action: `${action.pathname}${action.search}`,
          method: ((form.method || 'GET').toUpperCase() === 'GET' ? 'GET' : 'POST') as 'GET' | 'POST',
          crudOp: crudFor(form),
          noValidate: form.noValidate,
          fields,
          submit: {
            text: submit ? (submit instanceof HTMLInputElement ? submit.value : text(submit)) || null : null,
            locator: submit ? locatorFor(submit, 'button') : { strategy: 'css', value: 'button[type="submit"]' },
          },
        };
      }),
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map((link) => ({ href: normalizeHref(link.href), text: text(link), locator: locatorFor(link, 'link') }))
        .filter((link) => link.href),
      buttons: Array.from(document.querySelectorAll<HTMLButtonElement>('button')).map((button) => ({ text: text(button), locator: locatorFor(button, 'button') })),
      tables: Array.from(document.querySelectorAll('table')).map((table) => ({
        headers: Array.from(table.querySelectorAll('th')).map((th) => text(th)),
        rowCount: table.querySelectorAll('tbody tr').length,
      })),
    };
  });
  return enrichAccessibility(page, model as DomPageModel);
}

async function enrichAccessibility(page: Page, model: DomPageModel): Promise<DomPageModel> {
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

type SnapshotNode = { role?: string; name?: string; children?: SnapshotNode[] };
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

function mergeAccessibleField(field: DomPageModel['forms'][number]['fields'][number], node?: AccessibleNode): DomPageModel['forms'][number]['fields'][number] {
  if (!node) return field;
  if (field.locator.strategy === 'testid' || field.locator.strategy === 'label' || field.locator.strategy === 'placeholder') return field;
  const role = normalizeAccessibleRole(node.role, field.type);
  if (!role) return field;
  const value = `${role}:${node.name}`;
  return {
    ...field,
    label: field.label ?? node.name,
    locator: field.locator.strategy === 'css' || field.locator.strategy === 'name'
      ? { strategy: 'role', value }
      : field.locator,
  };
}

function mergeAccessibleSubmit(submit: DomPageModel['forms'][number]['submit'], node?: AccessibleNode): DomPageModel['forms'][number]['submit'] {
  if (!node) return submit;
  if (submit.locator.strategy === 'testid' || submit.locator.strategy === 'label' || submit.locator.strategy === 'placeholder') return submit;
  const role = normalizeAccessibleRole(node.role, 'button');
  if (!role) return submit;
  return {
    ...submit,
    text: submit.text ?? node.name,
    locator: submit.locator.strategy === 'css' || submit.locator.strategy === 'name'
      ? { strategy: 'role', value: `${role}:${node.name}` }
      : submit.locator,
  };
}

function mergeAccessibleButton(button: DomPageModel['buttons'][number], node?: AccessibleNode): DomPageModel['buttons'][number] {
  if (!node) return button;
  if (button.locator.strategy === 'testid' || button.locator.strategy === 'label' || button.locator.strategy === 'placeholder') return button;
  const role = normalizeAccessibleRole(node.role, 'button');
  if (!role) return button;
  return {
    ...button,
    locator: button.locator.strategy === 'css' || button.locator.strategy === 'name'
      ? { strategy: 'role', value: `${role}:${node.name}` }
      : button.locator,
  };
}

function mergeAccessibleLink(link: DomPageModel['links'][number], node?: AccessibleNode): DomPageModel['links'][number] {
  if (!node) return link;
  if (link.locator.strategy === 'testid' || link.locator.strategy === 'label' || link.locator.strategy === 'placeholder') return link;
  const role = normalizeAccessibleRole(node.role, 'link');
  if (!role) return link;
  return {
    ...link,
    locator: link.locator.strategy === 'css' || link.locator.strategy === 'name'
      ? { strategy: 'role', value: `${role}:${node.name}` }
      : link.locator,
  };
}

function normalizeAccessibleRole(role: string, fallback: string): string {
  if (role === 'searchbox') return 'textbox';
  if (role === 'textbox' || role === 'button' || role === 'link' || role === 'checkbox' || role === 'radio' || role === 'combobox' || role === 'spinbutton') {
    return role;
  }
  return fallback;
}

function normalizePath(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  return `${parsed.pathname}${parsed.search}`;
}
