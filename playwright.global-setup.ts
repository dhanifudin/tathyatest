import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { normalizeBaseUrl } from './generator/src/login.js';
import { inferLoginControlsOnPage, playwrightLocator } from './generator/src/login-runtime.js';

type RoleConfig = { name: string; username: string; password: string };
type TathyaConfig = {
  baseUrl: string;
  auth: {
    loginPath: string;
    roles: RoleConfig[];
  };
};

export function loadConfig(): TathyaConfig | null {
  // Keep in sync with playwright.config.ts: TATHYA_CONFIG overrides the default config path.
  const configPath = process.env.TATHYA_CONFIG ?? 'tathya.config.yaml';
  if (!existsSync(configPath)) return null;
  const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as TathyaConfig;
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
