import { describe, expect, it } from 'vitest';
import { buildInitConfig, defaultRoleName, initProjectPaths, slugifyProjectName } from '../../src/cli/init.js';
import { normalizeBaseUrl } from '../../src/auth/login.js';

describe('init project helpers', () => {
  it('slugifies project names for directory creation', () => {
    expect(slugifyProjectName('My App')).toBe('my-app');
    expect(slugifyProjectName('  Tathya Todo.React  ')).toBe('tathya-todo.react');
    expect(slugifyProjectName('todo___blade')).toBe('todo___blade');
    expect(slugifyProjectName('todo/react app')).toBe('todo-react-app');
  });

  it('rejects names without letters or numbers', () => {
    expect(() => slugifyProjectName(' !!! ')).toThrow('Project name must contain');
  });

  it('builds project-local config and generated test paths', () => {
    expect(initProjectPaths('My App')).toEqual({
      projectDir: 'my-app',
      configPath: 'my-app/tathya.config.yaml',
      outputDir: 'my-app/tests/generated',
    });
  });

  it('can build paths under an explicit working directory', () => {
    expect(initProjectPaths('My App', '/tmp/work')).toEqual({
      projectDir: '/tmp/work/my-app',
      configPath: '/tmp/work/my-app/tathya.config.yaml',
      outputDir: '/tmp/work/my-app/tests/generated',
    });
  });

  it('normalizes bare domains to absolute URLs', () => {
    expect(normalizeBaseUrl('saucedemo.com')).toBe('https://saucedemo.com');
    expect(normalizeBaseUrl('localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeBaseUrl('https://www.saucedemo.com')).toBe('https://www.saucedemo.com');
  });

  it('uses admin for the first credential role and user after that', () => {
    expect(defaultRoleName(0)).toBe('admin');
    expect(defaultRoleName(1)).toBe('user');
    expect(defaultRoleName(2)).toBe('role-3');
  });

  it('builds generic crawl config without case-study seed paths', () => {
    const config = buildInitConfig({
      baseUrl: 'https://www.saucedemo.com',
      loginPath: '/',
      roles: [{ name: 'standard', username: 'standard_user', password: 'secret_sauce' }],
      language: 'ts',
    });

    expect(config.crawl).toEqual({ maxDepth: 3, maxPages: 100, include: [], exclude: [], inferRestRoutes: true });
    expect(config).not.toHaveProperty('extractor');
    expect(config.hooks).toEqual({ reset: null });
    expect(config.oracle.errorSelector).toContain('[aria-invalid="true"]');
    expect(JSON.stringify(config)).not.toMatch(/\/todos|\/dashboard|\/admin|__testing/);
  });

  it('writes the chosen framework, Playwright by default', () => {
    const input = { baseUrl: 'http://127.0.0.1:8000', loginPath: '/login', roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }], language: 'ts' };
    expect(buildInitConfig(input).output.framework).toBe('playwright');
    expect(buildInitConfig({ ...input, framework: 'cypress' }).output).toEqual({ dir: 'tests/generated', language: 'ts', framework: 'cypress' });
  });

  it('records a reset hook when the app offers one', () => {
    const config = buildInitConfig({
      baseUrl: 'http://127.0.0.1:8000',
      loginPath: '/login',
      roles: [{ name: 'admin', username: 'admin@example.com', password: 'password' }],
      language: 'ts',
      resetPath: ' /__testing/reset ',
    });

    expect(config.hooks).toEqual({ reset: { method: 'POST', path: '/__testing/reset' } });
  });
});
