import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

type RoleConfig = { name: string; username: string; password: string };
type TathyaConfig = {
  baseUrl: string;
  auth: {
    loginPath: string;
    usernameField: string;
    passwordField: string;
    roles: RoleConfig[];
  };
};

export function loadConfig(): TathyaConfig | null {
  if (!existsSync('tathya.config.yaml')) return null;
  return YAML.parse(readFileSync('tathya.config.yaml', 'utf8')) as TathyaConfig;
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
      await page.locator(`[name="${cssAttr(cfg.auth.usernameField)}"]`).fill(role.username);
      await page.locator(`[name="${cssAttr(cfg.auth.passwordField)}"]`).fill(role.password);
      await page.getByRole('button', { name: /log in|login|sign in/i }).click();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.context().storageState({ path: join('storageState', `${role.name}.json`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

function cssAttr(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
