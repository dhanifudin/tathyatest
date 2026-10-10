import type { Locator as PlaywrightLocator, Page } from '@playwright/test';
import { inferLoginControlsFromHtml, type LoginControls, type LoginLocator } from './login.js';

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
      return page.locator(`#${cssEscape(locator.value)}`);
    case 'name':
      return page.locator(`[name="${cssEscape(locator.value)}"]`);
    case 'css':
      return page.locator(locator.value);
  }
}

export async function inferLoginControlsOnPage(page: Page): Promise<LoginControls> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return inferLoginControlsFromHtml(await page.content());
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
