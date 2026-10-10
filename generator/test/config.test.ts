import { afterEach, describe, expect, it, vi } from 'vitest';
import { configSchema, controlPlaneOf, DEFAULT_CONTROL_PLANE, DEFAULT_ERROR_SELECTOR, parseConfig } from '../src/config.js';

const baseConfig = {
  baseUrl: 'http://127.0.0.1:8000',
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts auth config without login field selectors', () => {
    expect(configSchema.safeParse(baseConfig).success).toBe(true);
  });

  it('accepts a minimal config of baseUrl plus roles and fills every default', () => {
    const parsed = parseConfig({
      baseUrl: 'http://127.0.0.1:8000',
      auth: { roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }] },
    });

    expect(parsed.auth.loginPath).toBe('/login');
    expect(parsed.output).toEqual({ dir: 'tests/generated', language: 'ts' });
    expect(parsed.coverage).toBe('all');
    expect(parsed.oracle.errorSelector).toContain('[role=alert]');
    expect(parsed.crawl).toEqual({ maxDepth: 3, maxPages: 100, include: [], exclude: [], inferRestRoutes: true });
    expect(parsed.data.faker).toEqual({ locale: 'en', seed: null });
    expect(parsed.evaluation.stacks).toEqual([]);
  });

  it('strips the obsolete extractor block and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const parsed = parseConfig({ ...baseConfig, extractor: { engine: 'static' } }, 'legacy.yaml');

    expect(parsed).not.toHaveProperty('extractor');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('legacy.yaml');
    expect(warn.mock.calls[0][0]).toContain('"extractor" is ignored');
  });

  it('leaves evaluation stack capabilities undefined so tt eval can probe the app', () => {
    const parsed = parseConfig({
      ...baseConfig,
      evaluation: { stacks: [{ name: 'blade', baseUrl: 'http://127.0.0.1:8000' }] },
    });

    expect(parsed.evaluation.stacks[0].coverage).toBeUndefined();
    expect(parsed.evaluation.stacks[0].faults).toBeUndefined();
    expect(parsed.evaluation.stacks[0].config).toBe('tathya.config.yaml');
  });

  it('defaults to read-write mode and accepts read-only', () => {
    expect(parseConfig({ baseUrl: 'http://127.0.0.1:8000', auth: baseConfig.auth }).mode).toBe('read-write');
    expect(parseConfig({ ...baseConfig, mode: 'read-only' }).mode).toBe('read-only');
    expect(() => parseConfig({ ...baseConfig, mode: 'monitor' })).toThrow('mode:');
  });

  it('has no app hooks unless the config declares them', () => {
    const minimal = parseConfig({ baseUrl: 'http://127.0.0.1:8000', auth: baseConfig.auth });
    expect(minimal.hooks).toBeUndefined();

    const withReset = parseConfig({ ...baseConfig, hooks: { reset: { path: '/__testing/reset' } } });
    expect(withReset.hooks).toEqual({ reset: { method: 'POST', path: '/__testing/reset' } });

    expect(() => parseConfig({ ...baseConfig, hooks: { reset: { path: 'reset' } } })).toThrow('hooks.reset.path');
  });

  it('defaults the eval control plane and lets a project override single paths', () => {
    const defaults = parseConfig({ baseUrl: 'http://127.0.0.1:8000', auth: baseConfig.auth });
    expect(controlPlaneOf(defaults)).toEqual(DEFAULT_CONTROL_PLANE);
    expect(defaults.evaluation.faults.catalogue).toBeUndefined();

    const custom = parseConfig({ ...baseConfig, evaluation: { controlPlane: { fault: '/qa/fault' }, faults: { catalogue: 'faults.json' } } });
    expect(controlPlaneOf(custom)).toEqual({ ...DEFAULT_CONTROL_PLANE, fault: '/qa/fault' });
    expect(custom.evaluation.faults.catalogue).toBe('faults.json');
  });

  it('ships a framework-neutral default error selector', () => {
    expect(DEFAULT_ERROR_SELECTOR).toContain('[aria-invalid="true"]');
    expect(DEFAULT_ERROR_SELECTOR).toContain('.invalid-feedback');
    expect(DEFAULT_ERROR_SELECTOR).toContain('.text-red-600');
  });

  it('renders validation errors one per line as path: message', () => {
    expect(() => parseConfig({ baseUrl: 'not a url', auth: { roles: [] } }, 'broken.yaml')).toThrow(
      /Invalid config broken\.yaml:\n  baseUrl: .*\n  auth\.roles: /,
    );
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
