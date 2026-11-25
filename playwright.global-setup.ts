import { chromium, type FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { performRenderedLogin } from './generator/src/auth/login-runtime.js';
import { parseConfig, type TathyaConfig } from './generator/src/config.js';

export function loadConfig(): TathyaConfig | null {
  // Keep in sync with playwright.config.ts: TATHYA_CONFIG overrides the default config path.
  const configPath = process.env.TATHYA_CONFIG ?? 'tathya.config.yaml';
  if (!existsSync(configPath)) return null;
  return parseConfig(YAML.parse(readFileSync(configPath, 'utf8')), configPath);
}

/** Store one logged-in session per role, which the role projects start from. */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;

  await mkdir('storageState', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of cfg.auth.roles) {
      const page = await browser.newPage({ baseURL: cfg.baseUrl });
      try {
        await performRenderedLogin(page, { baseUrl: cfg.baseUrl, loginPath: cfg.auth.loginPath }, role);
      } catch (error) {
        // Not fatal: an app whose login is broken (a seeded auth fault, say) must show up as
        // failing tests, not as a run without results. The stored session is then logged out.
        console.warn(`[global-setup] could not log in as "${role.name}": ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      }
      await page.context().storageState({ path: join('storageState', `${role.name}.json`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
