import { describe, expect, it } from 'vitest';
import { defaultRoleName, inferLoginFieldsFromHtml, initProjectPaths, slugifyProjectName } from '../src/init';

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

  it('uses admin for the first credential role and user after that', () => {
    expect(defaultRoleName(0)).toBe('admin');
    expect(defaultRoleName(1)).toBe('user');
    expect(defaultRoleName(2)).toBe('role-3');
  });

  it('infers login field names from a Breeze-like login form', () => {
    const fields = inferLoginFieldsFromHtml(`
      <form method="POST" action="/login">
        <input type="hidden" name="_token" value="token">
        <input id="email" type="email" name="email" />
        <input id="password" type="password" name="password" />
      </form>
    `);

    expect(fields).toEqual({ usernameField: 'email', passwordField: 'password' });
  });

  it('infers a two-field login form from structure when labels are missing', () => {
    const fields = inferLoginFieldsFromHtml('<form><input type="text" name="login"><input type="text" name="secret"></form>');

    expect(fields).toEqual({ usernameField: 'login', passwordField: 'secret' });
  });
});
