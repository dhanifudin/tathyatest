import { describe, expect, it } from 'vitest';
import { buildInitConfig, defaultRoleName, initProjectPaths, slugifyProjectName } from '../src/init';
import { inferLoginControlsFromHtml, normalizeBaseUrl } from '../src/login';

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
      engine: 'rendered',
      loginPath: '/',
      roles: [{ name: 'standard', username: 'standard_user', password: 'secret_sauce' }],
      language: 'ts',
    });

    expect(config.crawl).toEqual({ maxDepth: 3, maxPages: 100, include: [], exclude: [] });
    expect(JSON.stringify(config)).not.toMatch(/\/todos|\/dashboard|\/admin/);
  });

  it('infers Sauce Demo login controls from rendered DOM', () => {
    const controls = inferLoginControlsFromHtml(`
      <form>
        <input type="text" name="user-name" placeholder="Username" data-test="username" />
        <input type="password" name="password" placeholder="Password" data-test="password" />
        <input type="submit" value="Login" data-test="login-button" />
      </form>
    `);

    expect(controls).toEqual({
      username: { strategy: 'css', value: '[data-test="username"]' },
      password: { strategy: 'css', value: '[data-test="password"]' },
      submit: { strategy: 'css', value: '[data-test="login-button"]' },
    });
  });

  it('falls back to name-based selectors when no richer signal exists', () => {
    const controls = inferLoginControlsFromHtml(`
      <form method="POST" action="/login">
        <input type="text" name="login" />
        <input type="password" name="secret" />
        <button type="submit">Login</button>
      </form>
    `);

    expect(controls).toEqual({
      username: { strategy: 'name', value: 'login' },
      password: { strategy: 'name', value: 'secret' },
      submit: { strategy: 'role', value: 'button:Login' },
    });
  });
});
