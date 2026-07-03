import { defineConfig, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import YAML from 'yaml';
import { normalizeBaseUrl } from './generator/src/login.js';

type RoleConfig = { name: string };
type TathyaConfig = { baseUrl?: string; auth?: { roles?: RoleConfig[] } };

await ensureDisplay();

function loadConfig(): TathyaConfig {
  // TATHYA_CONFIG lets `tt eval` (and `tt --config … run`) point one execution at a per-stack
  // config without swapping the default file on disk.
  const configPath = process.env.TATHYA_CONFIG ?? 'tathya.config.yaml';
  if (!existsSync(configPath)) return {};
  const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as TathyaConfig;
  return { ...parsed, baseUrl: parsed.baseUrl ? normalizeBaseUrl(parsed.baseUrl) : parsed.baseUrl };
}

async function ensureDisplay(): Promise<void> {
  if (process.env.DISPLAY) return;

  const display = ':99';
  const socketPath = '/tmp/.X11-unix/X99';
  const child = spawn('Xvfb', [display, '-screen', '0', '1280x720x24', '-ac'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await access(socketPath);
      process.env.DISPLAY = display;
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Xvfb did not create ${socketPath}`);
}

const cfg = loadConfig();
const roles = cfg.auth?.roles ?? [];
const { viewport: _safariViewport, deviceScaleFactor: _safariDeviceScaleFactor, ...desktopSafariUse } = devices['Desktop Safari'];
const roleProjects = roles.length > 0
  ? roles.flatMap((role) => [
      {
        name: `${role.name}-chromium`,
        use: { ...devices['Desktop Chrome'], storageState: `storageState/${role.name}.json` },
      },
      {
        name: `${role.name}-firefox`,
        use: { ...devices['Desktop Firefox'], storageState: `storageState/${role.name}.json` },
      },
      {
        name: `${role.name}-webkit`,
        use: { ...desktopSafariUse, headless: false, viewport: null, storageState: `storageState/${role.name}.json` },
      },
    ])
  : [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ];

export default defineConfig({
  // TATHYA_TESTDIR lets `tt eval` retarget one run at the manual baseline suite while keeping
  // the same projects/storageState; the default is the generated suite.
  testDir: process.env.TATHYA_TESTDIR ?? './tests/generated',
  globalSetup: './playwright.global-setup.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: cfg.baseUrl ?? 'http://127.0.0.1:8000',
    launchOptions: {
      env: {
        ...process.env,
        LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
        // Playwright's bundled WebKit does not look in the system GIO module path, leaving it
        // without a TLS backend ("TLS support is not available" on https targets). Point it at
        // the host's glib-networking modules; harmless when the directory does not exist.
        GIO_MODULE_DIR: process.env.GIO_MODULE_DIR ?? '/usr/lib/gio/modules',
      },
    },
    trace: 'on-first-retry',
  },
  projects: roleProjects,
});
