import { chromium, type FullConfig, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { inferLoginControlsFromHtml, normalizeBaseUrl, type LoginLocator } from './generator/src/login.js';

type RoleConfig = { name: string; username: string; password: string };
type TathyaConfig = {
  baseUrl: string;
  auth: {
    loginPath: string;
    roles: RoleConfig[];
  };
};

function playwrightLocator(page: Page, locator: LoginLocator) {
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

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function inferLoginControlsOnPage(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return inferLoginControlsFromHtml(await page.content());
}

export function loadConfig(): TathyaConfig | null {
  if (!existsSync('tathya.config.yaml')) return null;
  const parsed = YAML.parse(readFileSync('tathya.config.yaml', 'utf8')) as TathyaConfig;
  return { ...parsed, baseUrl: normalizeBaseUrl(parsed.baseUrl) };
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const cfg = loadConfig();
  if (!cfg?.auth?.roles?.length) return;

  await mkdir('storageState', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of cfg.auth.roles) {
      const page = await browser.newPage({ baseURL: cfg.baseUrl });
      await page.goto(cfg.auth.loginPath);
      const login = await inferLoginControlsOnPage(page);
      await playwrightLocator(page, login.username).fill(role.username);
      await playwrightLocator(page, login.password).fill(role.password);
      await playwrightLocator(page, login.submit).click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.context().storageState({ path: join('storageState', `${role.name}.json`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
