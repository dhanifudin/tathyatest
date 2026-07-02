import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { CrawlOutput, FieldConstraints, Locator, PageModel } from '../crawl.js';
import type { TathyaConfig } from '../config.js';
import { inferLoginControlsOnPage, playwrightLocator } from '../login-runtime.js';

type DomPageModel = Omit<PageModel, 'url'>;

export async function renderedCrawl(config: TathyaConfig): Promise<void> {
  await mkdir('crawl', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of config.auth.roles) {
      const page = await browser.newPage({ baseURL: config.baseUrl });
      const landingPath = await login(page, config, role.name, role.username, role.password);
      const output = await crawlRole(page, config, role.name, landingPath);
      await writeFile(join('crawl', `${role.name}.json`), `${JSON.stringify(output, null, 2)}\n`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function login(page: Page, config: TathyaConfig, roleName: string, username: string, password: string): Promise<string> {
  await page.goto(config.auth.loginPath);
  const controls = await inferLoginControlsOnPage(page);
  await playwrightLocator(page, controls.username).fill(username);
  await playwrightLocator(page, controls.password).fill(password);
  const beforePath = normalizePath(page.url(), config.baseUrl);
  await Promise.all([
    page.waitForURL((url) => normalizePath(url.toString(), config.baseUrl) !== beforePath, { timeout: 5000 }).catch(() => undefined),
    playwrightLocator(page, controls.submit).click(),
  ]);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const landingPath = normalizePath(page.url(), config.baseUrl);
  await assertRenderedLoginSucceeded(page, config, roleName, landingPath);
  return landingPath;
}

async function crawlRole(page: Page, config: TathyaConfig, role: string, landingPath = '/'): Promise<CrawlOutput> {
  const queue = renderedCrawlSeeds(config, landingPath);
  const seen = new Set<string>();
  const pages: PageModel[] = [];

  for (let depth = 0; queue.length > 0 && pages.length < config.crawl.maxPages && depth <= config.crawl.maxDepth;) {
    const path = queue.shift();
    if (!path || seen.has(path) || excluded(path, config)) continue;
    seen.add(path);
    const currentPath = normalizePath(page.url(), config.baseUrl);
    const response = currentPath === path ? null : await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (!shouldExtractCrawlPage(response?.ok() ?? null, path, normalizePath(page.url(), config.baseUrl))) continue;
    await page.waitForLoadState('domcontentloaded');
    // Give SPAs time to hydrate before extracting controls.
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const model = await extractPage(page);
    pages.push({ url: normalizePath(page.url(), config.baseUrl), ...model });
    const discovered = await discoverInternalURLs(page, config.baseUrl);
    for (const href of uniquePaths([...model.links.map((link) => link.href), ...model.forms.map((form) => form.action), ...discovered])) {
      if (!seen.has(href) && !excluded(href, config)) queue.push(href);
    }
    depth = Math.max(depth, path.split('/').filter(Boolean).length);
  }

  if (pages.length === 0) {
    throw new Error(`rendered crawl found no pages for role "${role}" after login at ${landingPath}; check credentials, crawl.include, and crawl.exclude`);
  }

  return {
    baseUrl: config.baseUrl,
    engine: 'rendered',
    role,
    crawledAt: new Date().toISOString(),
    pages,
  };
}

export function shouldExtractCrawlPage(responseOk: boolean | null, requestedPath: string, currentPath: string): boolean {
  if (responseOk === false) return false;
  return currentPath === requestedPath || responseOk === true;
}

export function renderedCrawlSeeds(config: Pick<TathyaConfig, 'auth' | 'crawl'>, landingPath: string): string[] {
  const seeds = [landingPath];
  if (pathOnly(config.auth.loginPath) !== '/' && pathOnly(landingPath) !== '/') {
    seeds.push('/');
  }
  seeds.push(...config.crawl.include);
  return uniquePaths(seeds);
}

export async function assertRenderedLoginSucceeded(page: Pick<Page, 'locator'>, config: Pick<TathyaConfig, 'auth'>, roleName: string, landingPath: string): Promise<void> {
  if (!isPotentialLoginFailurePath(config, landingPath)) return;
  if (!(await loginFormStillVisible(page))) return;
  throw new Error(`rendered crawl login failed for role "${roleName}": credentials may be invalid; still on login page ${landingPath}`);
}

function isPotentialLoginFailurePath(config: Pick<TathyaConfig, 'auth'>, landingPath: string): boolean {
  const currentPath = pathOnly(landingPath);
  return currentPath === pathOnly(config.auth.loginPath) || currentPath === '/';
}

async function loginFormStillVisible(page: Pick<Page, 'locator'>): Promise<boolean> {
  const selectors = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[name*="password"]',
    'input[id*="password"]',
    'input[placeholder*="Password"]',
  ];
  for (const selector of selectors) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return true;
  }
  return false;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim() !== ''))];
}

function excluded(path: string, config: TathyaConfig): boolean {
  if (config.crawl.exclude.some((prefix) => path.startsWith(prefix))) return true;
  return false;
}

async function discoverInternalURLs(page: Page, baseUrl: string): Promise<string[]> {
  return page.evaluate((base) => {
    const normalize = (raw: string | null): string => {
      if (!raw?.trim()) return '';
      try {
        const url = new URL(raw, location.href);
        const root = new URL(base);
        if (url.origin !== root.origin || !['http:', 'https:'].includes(url.protocol)) return '';
        return `${url.pathname}${url.search}`;
      } catch {
        return '';
      }
    };
    const values: string[] = [];
    const add = (raw: string | null) => {
      const normalized = normalize(raw);
      if (normalized) values.push(normalized);
    };
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((element) => add(element.getAttribute('href')));
    document.querySelectorAll<HTMLFormElement>('form[action]').forEach((element) => add(element.getAttribute('action')));
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[formaction], input[formaction]').forEach((element) => add(element.getAttribute('formaction')));
    for (const attr of ['data-href', 'data-url', 'data-route', 'data-to']) {
      document.querySelectorAll(`[${attr}]`).forEach((element) => add(element.getAttribute(attr)));
    }
    return [...new Set(values)];
  }, baseUrl);
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
      // Capture all button-like controls: <button>, <input type=button|submit|reset|image>,
      // and elements with role=button|menuitem|tab that aren't already a button/input/a.
      // We do NOT exclude form-descendant controls here — the mapper deduplicates form-submit
      // locators via formSubmitLocators so these are harmless duplicates that get filtered out.
      buttons: (() => {
        const seen = new Set<Element>();
        const result: { text: string; locator: { strategy: string; value: string } }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) {
          seen.add(el);
          result.push({ text: text(el), locator: locatorFor(el, 'button') });
        }
        for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('input[type=button],input[type=submit],input[type=reset],input[type=image]'))) {
          if (seen.has(el)) continue;
          seen.add(el);
          const label = attr(el, 'value') ?? attr(el, 'aria-label') ?? '';
          result.push({ text: label, locator: locatorFor(el, 'button') });
        }
        for (const el of Array.from(document.querySelectorAll<Element>('[role=button],[role=menuitem],[role=tab]'))) {
          if (seen.has(el) || el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT') continue;
          seen.add(el);
          result.push({ text: text(el), locator: locatorFor(el, 'button') });
        }
        return result;
      })(),
      tables: Array.from(document.querySelectorAll('table')).map((table) => ({
        headers: Array.from(table.querySelectorAll('th')).map((th) => text(th)),
        rowCount: table.querySelectorAll('tbody tr').length,
      })),
      // Orphan selects: <select> elements that are NOT inside any <form>. Form-descendant
      // selects are already captured as fields. These capture SPA sort/filter dropdowns.
      controls: Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
        .filter((el) => !el.closest('form'))
        .map((el) => ({
          kind: 'select' as const,
          text: text(el) || null,
          options: Array.from(el.options).map((option) => ({ value: option.value, label: text(option) })),
          locator: locatorFor(el, 'combobox'),
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

function pathOnly(path: string): string {
  return new URL(path, 'http://tathyatest.local').pathname || '/';
}

export function normalizeInternalURL(raw: string, currentUrl: string, baseUrl: string): string {
  if (raw.trim() === '') return '';
  try {
    const url = new URL(raw, currentUrl);
    const root = new URL(baseUrl);
    if (url.origin !== root.origin || !['http:', 'https:'].includes(url.protocol)) return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}
