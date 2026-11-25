import { readFileSync } from 'node:fs';
import type { TathyaConfig } from '../../config.js';
import { GENERATED_HEADER } from '../types.js';

/** Published paths (inside `output.dir`) of the helper module and of Cypress's supportFile. */
export const SUPPORT_MODULE_PATH = 'support/tathya.ts';
export const SUPPORT_E2E_PATH = 'support/e2e.ts';

/** Import specifier for the helper module from a spec in a category folder (bundler resolution). */
export const SUPPORT_IMPORT = '../support/tathya';

/**
 * Source of the Cypress `support/tathya.ts`: login helpers, the `cy.tt` locator query, and the
 * oracle helpers, with the app-specific values (login path, error indicator, reset hook) pinned
 * from the config. Unlike the Playwright module it never carries credentials (cypress.config.ts
 * passes them as Cypress env secrets).
 */
export function supportModuleSource(config: Pick<TathyaConfig, 'auth' | 'oracle' | 'hooks'>): string {
  const reset = config.hooks?.reset ?? null;
  const pinned = [
    `const loginPath = ${JSON.stringify(config.auth.loginPath)};`,
    `const errorSelector = ${JSON.stringify(config.oracle.errorSelector)};`,
    `const resetHook: { method: 'POST' | 'GET' | 'DELETE'; path: string } | null = ${JSON.stringify(reset)};`,
    '',
  ].join('\n');
  const template = loadTemplate('tathya.ts');
  return GENERATED_HEADER + template.slice(template.indexOf('import ')).replace(CONFIG_BLOCK, () => pinned);
}

export function supportE2eSource(): string {
  const template = loadTemplate('e2e.ts');
  return GENERATED_HEADER + template.slice(template.indexOf('import '));
}

const CONFIG_BLOCK = /\/\/ <tathya:config>\n[\s\S]*?\/\/ <\/tathya:config>\n/;

const templateCache = new Map<string, string>();
function loadTemplate(name: string): string {
  let source = templateCache.get(name);
  if (source === undefined) {
    source = readFileSync(new URL(`./templates/${name}`, import.meta.url), 'utf8');
    templateCache.set(name, source);
  }
  return source;
}
