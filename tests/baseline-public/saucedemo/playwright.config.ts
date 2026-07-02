/**
 * Standalone Playwright config for running the three public SauceDemo baseline suites.
 *
 * This wrapper runs under a single Chromium project against https://www.saucedemo.com.
 * It does NOT use storageState (each suite handles login itself), so it's fully isolated
 * from the tt role-project setup in the root playwright.config.ts.
 *
 * Requires each submodule to have its own node_modules installed; see SOURCES.md.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: [
    'ashutoshfolane-playwright-saucedemo/tests/**/*.spec.ts',
    'aferminboada-saucedemo-pom/tests/**/*.spec.ts',
    'renanpacheco21-saucedemo-playwright/tests/**/*.spec.ts',
  ],
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
