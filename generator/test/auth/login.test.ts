import { describe, expect, it } from 'vitest';
import { inferLoginControlsFromHtml, normalizeBaseUrl } from '../../src/auth/login.js';

const breeze = `<form><label for="email">Email</label><input id="email" type="email" name="email" required autocomplete="username"><label for="password">Password</label><input id="password" type="password" name="password"><button type="submit">Log in</button></form>`;
const saucedemo = `<form><input placeholder="Username" type="text" data-test="username" id="user-name" name="user-name"><input placeholder="Password" type="password" data-test="password" id="password" name="password"><input type="submit" data-test="login-button" id="login-button" name="login-button" value="Login"></form>`;
const testIdOnly = `<form><input type="email" name="email" data-testid="login-email"><input type="password" name="pw" data-testid="login-pw"><button type="submit" data-testid="login-go">Sign in</button></form>`;

describe('inferLoginControlsFromHtml', () => {
  it('finds the Breeze controls by stable id and the button by its role and name', () => {
    expect(inferLoginControlsFromHtml(breeze)).toEqual({
      username: { strategy: 'id', value: 'email' },
      password: { strategy: 'id', value: 'password' },
      submit: { strategy: 'role', value: 'button:Log in' },
    });
  });

  it('uses the data-test attribute that SauceDemo ships', () => {
    const controls = inferLoginControlsFromHtml(saucedemo);
    expect(controls.username).toEqual({ strategy: 'css', value: '[data-test="username"]' });
    expect(controls.submit).toEqual({ strategy: 'css', value: '[data-test="login-button"]' });
  });

  it('names data-testid in the selector when that is the attribute the element has', () => {
    const controls = inferLoginControlsFromHtml(testIdOnly);
    expect(controls.username).toEqual({ strategy: 'css', value: '[data-testid="login-email"]' });
    expect(controls.password).toEqual({ strategy: 'css', value: '[data-testid="login-pw"]' });
    expect(controls.submit).toEqual({ strategy: 'css', value: '[data-testid="login-go"]' });
  });

  it('falls back to conventional names when the page has no login form', () => {
    const controls = inferLoginControlsFromHtml('<p>nothing here</p>');
    expect(controls.username).toEqual({ strategy: 'name', value: 'email' });
    expect(controls.password).toEqual({ strategy: 'name', value: 'password' });
  });
});

describe('normalizeBaseUrl', () => {
  it('adds a scheme: http for local hosts, https otherwise', () => {
    expect(normalizeBaseUrl('127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeBaseUrl('localhost')).toBe('http://localhost');
    expect(normalizeBaseUrl('example.com')).toBe('https://example.com');
    expect(normalizeBaseUrl('http://x.test')).toBe('http://x.test');
  });
});
