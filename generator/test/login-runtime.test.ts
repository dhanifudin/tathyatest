import { describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';
import { playwrightLocator } from '../src/login-runtime.js';

// A page double that records which locator API was called with what.
const page = {
  getByTestId: (value: string) => ['testid', value],
  getByRole: (role: string, options?: { name?: string }) => ['role', role, options?.name],
  getByLabel: (value: string, options?: { exact?: boolean }) => ['label', value, options?.exact],
  getByPlaceholder: (value: string) => ['placeholder', value],
  locator: (selector: string) => ['locator', selector],
} as unknown as Page;

describe('playwrightLocator', () => {
  it('maps every stored strategy onto the matching Playwright API', () => {
    expect(playwrightLocator(page, { strategy: 'testid', value: 'login-button' })).toEqual(['testid', 'login-button']);
    expect(playwrightLocator(page, { strategy: 'role', value: 'button:Log in' })).toEqual(['role', 'button', 'Log in']);
    expect(playwrightLocator(page, { strategy: 'role', value: 'button:a:b' })).toEqual(['role', 'button', 'a:b']);
    expect(playwrightLocator(page, { strategy: 'role', value: 'button' })).toEqual(['role', 'button', undefined]);
    expect(playwrightLocator(page, { strategy: 'label', value: 'Email' })).toEqual(['label', 'Email', true]);
    expect(playwrightLocator(page, { strategy: 'placeholder', value: 'Username' })).toEqual(['placeholder', 'Username']);
    expect(playwrightLocator(page, { strategy: 'id', value: 'email' })).toEqual(['locator', '#email']);
    expect(playwrightLocator(page, { strategy: 'name', value: 'user"name' })).toEqual(['locator', '[name="user\\"name"]']);
    expect(playwrightLocator(page, { strategy: 'css', value: 'form input' })).toEqual(['locator', 'form input']);
  });
});
