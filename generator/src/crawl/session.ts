import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { CRAWL_SCHEMA_VERSION, type CrawlOutput, type PageModel } from './model.js';
import type { TathyaConfig } from '../config.js';
import { loginFormStillVisible, pathOf, performRenderedLogin, settlePage, type Credentials } from '../auth/login-runtime.js';
import { log } from '../logger.js';
import { canonicalPath, DEFAULT_PATHS } from '../util/paths.js';
import { isLogoutPath } from './crud.js';
import { extractPage, type DomPageModel } from './dom-extract.js';
import { crawlFingerprint } from './fingerprint.js';

/**
 * Crawl every configured role and write one `<role>.json` each. The files are written only when
 * every role succeeded, and this run's old files are removed first: a failed crawl never leaves
 * snapshots of different runs to be compared by the RBAC matrix.
 */
export async function renderedCrawl(config: TathyaConfig, crawlDir: string = DEFAULT_PATHS.crawlDir): Promise<void> {
  await mkdir(crawlDir, { recursive: true });
  for (const role of config.auth.roles) await rm(join(crawlDir, `${role.name}.json`), { force: true });
  const outputs: CrawlOutput[] = [];
  const browser = await chromium.launch();
  try {
    for (const role of config.auth.roles) {
      const context = await browser.newContext({ baseURL: config.baseUrl });
      try {
        outputs.push(await crawlRole(context, config, role));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  for (const output of outputs) {
    await writeFile(join(crawlDir, `${output.role}.json`), `${JSON.stringify(output, null, 2)}\n`);
  }
}

export async function crawlRole(context: BrowserContext, config: TathyaConfig, role: Credentials): Promise<CrawlOutput> {
  const target = { baseUrl: config.baseUrl, loginPath: config.auth.loginPath };
  let page = await context.newPage();
  const landingPath = await performRenderedLogin(page, target, role);
  const queue = renderedCrawlSeeds(config, landingPath);
  const seen = new Set<string>();
  const recorded = new Set<string>();
  const pages: PageModel[] = [];

  while (queue.length > 0 && pages.length < config.crawl.maxPages) {
    const path = queue.shift();
    if (!path || seen.has(path) || excluded(path, config)) continue;
    seen.add(path);
    if (page.isClosed()) page = await context.newPage();
    let visit = await tryVisit(page, config, role.name, path);
    // A page that needed the session shows the login form instead. The session may have ended
    // (an earlier page dropped it): log in again and retry once. Never record the login page.
    if (visit?.kind === 'login-page' && canonicalPath(path) !== canonicalPath(config.auth.loginPath)) {
      await performRenderedLogin(page, target, role);
      visit = await tryVisit(page, config, role.name, path);
      if (visit?.kind === 'login-page') log.warn(`[crawl] ${role.name}: ${path} shows the login form even after logging in again; skipped`);
    }
    if (visit?.kind !== 'page') continue;
    // Redirects and trailing slashes make different links end on one page: record it once.
    if (recorded.has(visit.url) || excluded(visit.url, config)) continue;
    recorded.add(visit.url);
    seen.add(visit.url);
    pages.push({ url: visit.url, ...visit.model });
    // Only GET form actions are navigable; visiting a POST-only action with page.goto triggers
    // MethodNotAllowed (405) error pages on the target app.
    const getFormActions = visit.model.forms.filter((form) => form.method === 'GET').map((form) => form.action);
    for (const href of uniquePaths([...visit.model.links.map((link) => link.href), ...getFormActions, ...visit.discovered])) {
      if (!seen.has(href) && !excluded(href, config) && depthOf(href) <= config.crawl.maxDepth) queue.push(href);
    }
  }

  if (pages.length === 0) {
    throw new Error(`rendered crawl found no pages for role "${role.name}" after login at ${landingPath}; check credentials, crawl.include, and crawl.exclude`);
  }

  return {
    baseUrl: config.baseUrl,
    schemaVersion: CRAWL_SCHEMA_VERSION,
    role: role.name,
    crawledAt: new Date().toISOString(),
    landingPath,
    configFingerprint: crawlFingerprint(config),
    pages,
  };
}

type Visit =
  | { kind: 'page'; url: string; model: DomPageModel; discovered: string[] }
  | { kind: 'login-page' }
  | { kind: 'skip' };

/** One page that cannot be loaded or read (a download, a timeout) is skipped, not fatal. */
async function tryVisit(page: Page, config: TathyaConfig, role: string, path: string): Promise<Visit | null> {
  try {
    return await visitPage(page, config, role, path);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    log.warn(`[crawl] ${role}: skipped ${path}: ${reason}`);
    return null;
  }
}

async function visitPage(page: Page, config: TathyaConfig, role: string, path: string): Promise<Visit> {
  const alreadyThere = pathOf(page.url(), config.baseUrl) === path;
  const response = alreadyThere ? null : await page.goto(path, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? null;
  if (!shouldExtractCrawlPage(status, path, pathOf(page.url(), config.baseUrl))) {
    if (status !== null && status >= 500) log.warn(`[crawl] ${role}: ${path} answered ${status}; not recorded`);
    return { kind: 'skip' };
  }
  // Give SPAs time to hydrate (and to redirect on the client) before reading the page.
  await settlePage(page);
  if (new URL(page.url()).origin !== new URL(config.baseUrl).origin) return { kind: 'skip' };
  const url = pathOf(page.url(), config.baseUrl);
  if (canonicalPath(url) === canonicalPath(config.auth.loginPath) && await loginFormStillVisible(page)) return { kind: 'login-page' };
  const model = await extractStable(page);
  // A 404 that rendered nothing interactive is a genuine error page, not an SPA deep link.
  if (isMeaningfulErrorPage(status, model)) return { kind: 'skip' };
  return { kind: 'page', url, model, discovered: await discoverInternalURLs(page, config.baseUrl) };
}

/** A client-side redirect can destroy the document mid-read; read the new one once. */
async function extractStable(page: Page): Promise<DomPageModel> {
  try {
    return await extractPage(page);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) throw error;
    await settlePage(page);
    return extractPage(page);
  }
}

/**
 * Whether a visited URL shows something the role may use. Denials (401, 403) and server errors are
 * never recorded, however much layout they render — the page would count as reachable for the
 * role. A 404 that stayed on the requested path is kept for SPA hosts (e.g. saucedemo.com), which
 * serve the app shell with that status for deep links; genuine 404 pages are filtered after
 * extraction by `isMeaningfulErrorPage`. `status` is null when no navigation was needed.
 */
export function shouldExtractCrawlPage(status: number | null, requestedPath: string, currentPath: string): boolean {
  if (status === null) return currentPath === requestedPath;
  if (status < 400) return true;
  return status === 404 && currentPath === requestedPath;
}

/**
 * True when an error response also rendered no navigable app content — a real error page.
 * Buttons are deliberately excluded from the signal: framework debug pages (e.g. Laravel's 405
 * page with APP_DEBUG=true) render copy/share buttons, while genuine app pages reachable through
 * navigation expose same-origin links, forms, or selects.
 */
export function isMeaningfulErrorPage(status: number | null, model: Pick<DomPageModel, 'forms' | 'links'> & { controls?: unknown[] }): boolean {
  if (status === null || status < 400) return false;
  // Debug pages decorate themselves with `#` anchors; those lead nowhere.
  const navigable = model.forms.length + model.links.filter((link) => !link.inPage).length + (model.controls?.length ?? 0);
  return navigable === 0;
}

/** The landing page, the site root, and every `crawl.include` entry resolved against the app. */
export function renderedCrawlSeeds(config: Pick<TathyaConfig, 'baseUrl' | 'auth' | 'crawl'>, landingPath: string): string[] {
  const seeds = [landingPath];
  if (canonicalPath(config.auth.loginPath) !== '/' && canonicalPath(landingPath) !== '/') {
    seeds.push('/');
  }
  const origin = new URL(config.baseUrl).origin;
  for (const entry of config.crawl.include) {
    const url = new URL(entry, new URL('/', config.baseUrl));
    if (url.origin === origin) seeds.push(`${url.pathname}${url.search}`);
    else log.warn(`[crawl] include entry ${entry} is outside ${origin}; ignored`);
  }
  return uniquePaths(seeds);
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim() !== ''))];
}

/** `crawl.exclude` prefixes, plus session-ending paths: visiting one would log the crawler out. */
function excluded(path: string, config: TathyaConfig): boolean {
  return isLogoutPath(path) || config.crawl.exclude.some((prefix) => path.startsWith(prefix));
}

/** `crawl.maxDepth` counts path segments; it limits discovered links, not seeds. */
function depthOf(path: string): number {
  return canonicalPath(path).split('/').filter(Boolean).length;
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
