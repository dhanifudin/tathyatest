import type { Locator as PlaywrightLocator, Page } from '@playwright/test';
import { loginControlsOfDocument, type LoginControls, type LoginLocator } from './login-dom.js';
import { canonicalPath } from '../util/paths.js';
import { escapeAttrValue, escapeCssIdent } from '../util/escape.js';

const LOGIN_REDIRECT_TIMEOUT_MS = 5000;
/** Apps that poll or hold a socket open never go idle: wait this long, then carry on. */
export const NETWORK_IDLE_TIMEOUT_MS = 5000;

/** Turn a stored login-control locator into a live Playwright locator (same chain as locator.ts). */
export function playwrightLocator(page: Page, locator: LoginLocator): PlaywrightLocator {
  switch (locator.strategy) {
    case 'testid':
      return page.getByTestId(locator.value);
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      return name ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name }) : page.getByRole(role as Parameters<Page['getByRole']>[0]);
    }
    case 'label':
      return page.getByLabel(locator.value, { exact: true });
    case 'placeholder':
      return page.getByPlaceholder(locator.value);
    case 'id':
      return page.locator(`#${escapeCssIdent(locator.value)}`);
    case 'name':
      return page.locator(`[name="${escapeAttrValue(locator.value)}"]`);
    case 'css':
      return page.locator(locator.value);
  }
}

/** Wait for the document and, within a bound, for the network to settle (SPA hydration). */
export async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
}

export async function inferLoginControlsOnPage(page: Page): Promise<LoginControls> {
  await settlePage(page);
  return page.evaluate(loginControlsOfDocument, null);
}

export type RenderedLoginTarget = { baseUrl: string; loginPath: string };
export type Credentials = { name: string; username: string; password: string };

/**
 * Log in through the rendered login form and return the path the app landed on. Throws when the
 * login form is still showing afterwards.
 */
export async function performRenderedLogin(page: Page, target: RenderedLoginTarget, role: Credentials): Promise<string> {
  await page.goto(target.loginPath);
  const controls = await inferLoginControlsOnPage(page);
  const password = playwrightLocator(page, controls.password).first();
  await playwrightLocator(page, controls.username).first().fill(role.username);
  await password.fill(role.password);
  const beforePath = pathOf(page.url(), target.baseUrl);
  await Promise.all([
    page.waitForURL((url) => pathOf(url.toString(), target.baseUrl) !== beforePath, { timeout: LOGIN_REDIRECT_TIMEOUT_MS }).catch(() => undefined),
    playwrightLocator(page, controls.submit).first().click(),
  ]);
  // SPAs push the new URL before the login DOM is replaced; wait for the form to go away.
  await password.waitFor({ state: 'hidden', timeout: LOGIN_REDIRECT_TIMEOUT_MS }).catch(() => undefined);
  await settlePage(page);
  const landingPath = pathOf(page.url(), target.baseUrl);
  await assertRenderedLoginSucceeded(page, target.loginPath, role.name, landingPath);
  return landingPath;
}

export async function assertRenderedLoginSucceeded(page: Pick<Page, 'locator'>, loginPath: string, roleName: string, landingPath: string): Promise<void> {
  const current = canonicalPath(landingPath);
  if (current !== canonicalPath(loginPath) && current !== '/') return;
  if (!(await loginFormStillVisible(page))) return;
  throw new Error(`rendered crawl login failed for role "${roleName}": credentials may be invalid; still on login page ${landingPath}`);
}

export async function loginFormStillVisible(page: Pick<Page, 'locator'>): Promise<boolean> {
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

/** Path and query of `url`, resolved against the app's base URL. */
export function pathOf(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  return `${parsed.pathname}${parsed.search}`;
}
