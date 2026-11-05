import { parseConfig, type TathyaConfig } from '../../src/config.js';

/** A valid Blade-flavoured config; pass only what a test cares about (zod fills the rest). */
export function makeConfig(overrides: Record<string, unknown> = {}): TathyaConfig {
  return parseConfig({
    baseUrl: 'http://127.0.0.1:8000',
    oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
    auth: { loginPath: '/login', roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }] },
    ...overrides,
  });
}

/** Field constraints with nothing set. */
export const noConstraints = { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null };

/** A crawled page with no forms, links, buttons, or tables. */
export const emptyPage = (url: string, title: string) => ({ url, title, forms: [], links: [], buttons: [], tables: [] });
