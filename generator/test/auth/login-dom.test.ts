import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { loginControlsOfDocument, type LoginControls } from '../../src/auth/login-dom.js';
import { chromiumAvailable, launchBrowser } from '../helpers/browser.js';

describe.skipIf(!chromiumAvailable)('loginControlsOfDocument (in a browser)', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser.close(); });

  async function infer(html: string): Promise<LoginControls> {
    const page = await browser.newPage();
    await page.setContent(html);
    const controls = await page.evaluate(loginControlsOfDocument, null);
    await page.close();
    return controls;
  }

  it('finds the Breeze controls past the CSRF token', async () => {
    expect(await infer('<form><input type="hidden" name="_token" value="x"><label for="email">Email</label><input id="email" type="email" name="email" autocomplete="username"><label for="password">Password</label><input id="password" type="password" name="password"><button type="submit">Log in</button></form>')).toEqual({
      username: { strategy: 'id', value: 'email' },
      password: { strategy: 'id', value: 'password' },
      submit: { strategy: 'role', value: 'button:Log in' },
    });
  });

  it('takes the visible text field when no attribute names a user, never a hidden input', async () => {
    const controls = await infer('<form method="post"><input type="hidden" name="_token"><input type="text" name="nim"><input type="password" name="secret"><button>Masuk</button></form>');
    expect(controls).toEqual({
      username: { strategy: 'name', value: 'nim' },
      password: { strategy: 'name', value: 'secret' },
      submit: { strategy: 'role', value: 'button:Masuk' },
    });
  });

  it('reads attributes exactly: data-testid is not id, aria-invalid is not id', async () => {
    const controls = await infer('<form><input type="email" aria-invalid="false" name="email"><input type="password" data-valid="yes" name="pw"><button data-type="x">Sign in</button></form>');
    expect(controls.username).toEqual({ strategy: 'name', value: 'email' });
    expect(controls.password).toEqual({ strategy: 'name', value: 'pw' });
    expect(controls.submit).toEqual({ strategy: 'role', value: 'button:Sign in' });
  });

  it('uses the data-test attributes SauceDemo ships and names data-testid when that is the one', async () => {
    const sauce = await infer('<form><input placeholder="Username" data-test="username"><input placeholder="Password" type="password" data-test="password"><input type="submit" data-test="login-button" value="Login"></form>');
    expect(sauce.username).toEqual({ strategy: 'css', value: '[data-test="username"]' });
    expect(sauce.submit).toEqual({ strategy: 'css', value: '[data-test="login-button"]' });
    const testId = await infer('<form><input type="email" data-testid="login-email"><input type="password" data-testid="login-pw"><button data-testid="login-go">Sign in</button></form>');
    expect(testId.username).toEqual({ strategy: 'css', value: '[data-testid="login-email"]' });
    expect(testId.submit).toEqual({ strategy: 'css', value: '[data-testid="login-go"]' });
  });

  it('ignores controls the user cannot see', async () => {
    const controls = await infer('<input type="text" name="user_trap" style="display:none"><form><input type="text" name="login"><input type="password" name="password"><button>Login</button></form>');
    expect(controls.username).toEqual({ strategy: 'name', value: 'login' });
  });

  it('falls back to generic selectors when the page has no login form', async () => {
    const controls = await infer('<p>nothing here</p>');
    expect(controls.password).toEqual({ strategy: 'css', value: 'input[type="password"]' });
  });
});
