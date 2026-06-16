import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config.js';

const baseConfig = {
  baseUrl: 'http://127.0.0.1:8000',
  extractor: { engine: 'static' },
  output: { dir: 'tests/generated', language: 'ts' },
  coverage: 'all',
  oracle: { errorSelector: '.invalid-feedback, [role=alert], .text-red-600, x-input-error p' },
  auth: {
    loginPath: '/login',
    roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
  },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
  data: { fields: {}, defaults: {}, unique: [], duplicates: {}, requiredFields: [], confirmFields: [] },
};

describe('configSchema', () => {
  it('accepts auth config without login field selectors', () => {
    expect(configSchema.safeParse(baseConfig).success).toBe(true);
  });

  it('rejects removed login selector config keys', () => {
    const result = configSchema.safeParse({
      ...baseConfig,
      auth: {
        ...baseConfig.auth,
        loginSelectors: {
          username: { strategy: 'name', value: 'email' },
          password: { strategy: 'name', value: 'password' },
          submit: { strategy: 'role', value: 'button:Log in' },
        },
      },
    });

    expect(result.success).toBe(false);
  });
});
