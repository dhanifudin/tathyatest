import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { CRAWL_SCHEMA_VERSION, type CrawlOutput, type PageModel } from './model.js';
import type { TathyaConfig } from '../config.js';
import { inferLoginControlsOnPage, playwrightLocator } from '../auth/login-runtime.js';
import { canonicalPath } from '../util/paths.js';
import { extractPage, type DomPageModel } from './dom-extract.js';
import { DEFAULT_PATHS } from '../util/paths.js';

const LOGIN_REDIRECT_TIMEOUT_MS = 5000;


export async function renderedCrawl(config: TathyaConfig): Promise<void> {
  await mkdir(DEFAULT_PATHS.crawlDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of config.auth.roles) {
      const page = await browser.newPage({ baseURL: config.baseUrl });
      const landingPath = await login(page, config, role.name, role.username, role.password);
      const output = await crawlRole(page, config, role.name, landingPath);
      await writeFile(join(DEFAULT_PATHS.crawlDir, `${role.name}.json`), `${JSON.stringify(output, null, 2)}\n`);
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
    page.waitForURL((url) => normalizePath(url.toString(), config.baseUrl) !== beforePath, { timeout: LOGIN_REDIRECT_TIMEOUT_MS }).catch(() => undefined),
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
    // A non-ok response that rendered nothing interactive is a genuine error page (Laravel 404),
    // not an SPA deep link served with a 404 status — drop it.
    if (isMeaningfulErrorPage(response?.ok() ?? null, model)) continue;
    pages.push({ url: normalizePath(page.url(), config.baseUrl), ...model });
    const discovered = await discoverInternalURLs(page, config.baseUrl);
    // Only GET form actions are navigable; visiting a POST-only action with page.goto triggers
    // MethodNotAllowed (405) error pages on the target app.
    const getFormActions = model.forms.filter((form) => form.method === 'GET').map((form) => form.action);
    for (const href of uniquePaths([...model.links.map((link) => link.href), ...getFormActions, ...discovered])) {
      if (!seen.has(href) && !excluded(href, config)) queue.push(href);
    }
    depth = Math.max(depth, path.split('/').filter(Boolean).length);
  }

  if (pages.length === 0) {
    throw new Error(`rendered crawl found no pages for role "${role}" after login at ${landingPath}; check credentials, crawl.include, and crawl.exclude`);
  }

  return {
    baseUrl: config.baseUrl,
    schemaVersion: CRAWL_SCHEMA_VERSION,
    role,
    crawledAt: new Date().toISOString(),
    pages,
  };
}

/**
 * Whether a visited URL is worth extracting. A non-ok document response does NOT disqualify a
 * page that stayed on the requested path: SPA hosts (e.g. saucedemo.com) serve the app shell with
 * a 404 status for deep links while the client router still renders the real page. Genuine error
 * pages are filtered after extraction by `isMeaningfulErrorPage` (they render no interactive
 * content).
 */
export function shouldExtractCrawlPage(responseOk: boolean | null, requestedPath: string, currentPath: string): boolean {
  return currentPath === requestedPath || responseOk === true;
}

/**
 * True when a non-ok response also rendered no navigable app content — a real error page.
 * Buttons are deliberately excluded from the signal: framework debug pages (e.g. Laravel's 405
 * page with APP_DEBUG=true) render copy/share buttons, while genuine app pages reachable through
 * navigation expose same-origin links, forms, or selects.
 */
export function isMeaningfulErrorPage(responseOk: boolean | null, model: Pick<DomPageModel, 'forms' | 'links'> & { controls?: unknown[] }): boolean {
  if (responseOk !== false) return false;
  const navigable = model.forms.length + model.links.length + (model.controls?.length ?? 0);
  return navigable === 0;
}

export function renderedCrawlSeeds(config: Pick<TathyaConfig, 'auth' | 'crawl'>, landingPath: string): string[] {
  const seeds = [landingPath];
  if (canonicalPath(config.auth.loginPath) !== '/' && canonicalPath(landingPath) !== '/') {
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
  const currentPath = canonicalPath(landingPath);
  return currentPath === canonicalPath(config.auth.loginPath) || currentPath === '/';
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
    // Only GET actions are navigable; visiting POST-only actions via page.goto yields 405s.
    document.querySelectorAll<HTMLFormElement>('form[action]').forEach((element) => {
      if ((element.getAttribute('method') ?? 'get').toLowerCase() === 'get') add(element.getAttribute('action'));
    });
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[formaction], input[formaction]').forEach((element) => {
      const method = (element.getAttribute('formmethod') ?? element.form?.getAttribute('method') ?? 'get').toLowerCase();
      if (method === 'get') add(element.getAttribute('formaction'));
    });
    for (const attr of ['data-href', 'data-url', 'data-route', 'data-to']) {
      document.querySelectorAll(`[${attr}]`).forEach((element) => add(element.getAttribute(attr)));
    }
    return [...new Set(values)];
  }, baseUrl);
}

function normalizePath(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  return `${parsed.pathname}${parsed.search}`;
}
