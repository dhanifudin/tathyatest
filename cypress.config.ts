import { existsSync, readFileSync } from 'node:fs';
import { plugin as cypressGrepPlugin } from '@cypress/grep/plugin';
import { defineConfig } from 'cypress';
import YAML from 'yaml';

// Root config of the Cypress adapter (`output.framework: cypress` / `--framework cypress`), the
// counterpart of playwright.config.ts. `tt run` and `tt eval` start one Cypress run per
// (role × browser) and pass the role as `--expose role=<name>`.

type RoleConfig = { name: string; username: string; password: string };
type TathyaConfig = { baseUrl?: string; output?: { dir?: string }; auth?: { roles?: RoleConfig[] } };

function loadConfig(): TathyaConfig {
  // TATHYA_CONFIG lets `tt eval` (and `tt --config … run`) point one execution at a per-stack
  // config without swapping the default file on disk.
  const configPath = process.env.TATHYA_CONFIG ?? 'tathya.config.yaml';
  if (!existsSync(configPath)) return {};
  return YAML.parse(readFileSync(configPath, 'utf8')) as TathyaConfig;
}

// Same rule as generator/src/auth/login.ts normalizeBaseUrl (kept inline: Cypress bundles this file).
function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

const cfg = loadConfig();
const outputDir = cfg.output?.dir ?? 'tests/generated';
// TATHYA_TESTDIR retargets one run at a manual baseline suite (the generated support file still
// registers the tag filter and the `cy.tt` query).
const testDir = process.env.TATHYA_TESTDIR ?? outputDir;
const supportFile = [`${outputDir}/support/e2e.ts`, `${outputDir}/support/e2e.js`].find((path) => existsSync(path)) ?? false;

export default defineConfig({
  e2e: {
    baseUrl: normalizeBaseUrl(cfg.baseUrl ?? 'http://127.0.0.1:8000'),
    specPattern: `${testDir}/**/*.cy.{ts,js}`,
    supportFile,
    // Credentials stay out of the generated files: the support module reads them with cy.env().
    env: {
      tathyaRoles: Object.fromEntries((cfg.auth?.roles ?? []).map((role) => [role.name, { username: role.username, password: role.password }])),
    },
    setupNodeEvents(_on, config) {
      // Pre-filters spec files for `--expose grep=…,grepFilterSpecs=true` (fault runs).
      cypressGrepPlugin(config);
      return config;
    },
  },
  // Flake and agreement metrics need raw outcomes: no retries. Artefacts are off by default.
  retries: 0,
  video: false,
  screenshotOnRunFailure: false,
  fixturesFolder: false,
  // WebKit needs `npm install --save-dev playwright-webkit`; it stays experimental in Cypress.
  experimentalWebKitSupport: true,
});
