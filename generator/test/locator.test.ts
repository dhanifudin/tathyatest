import { describe, expect, it } from 'vitest';
import { locatorSource } from '../src/locator.js';

describe('locatorSource', () => {
  it('renders stable css selectors and role locators', () => {
    expect(locatorSource({ strategy: 'css', value: '#wrapper span' })).toBe('page.locator("#wrapper span")');
    expect(locatorSource({ strategy: 'role', value: 'textbox:Search' })).toBe('page.getByRole("textbox", { name: "Search" })');
    expect(locatorSource({ strategy: 'label', value: 'Contact email' })).toBe('page.getByLabel("Contact email", { exact: true })');
  });

  it('escapes characters that would break an #id selector', () => {
    expect(locatorSource({ strategy: 'id', value: 'user-name' })).toBe('page.locator("#user-name")');
    expect(locatorSource({ strategy: 'id', value: 'a.b' })).toBe('page.locator("#a\\\\.b")');
    expect(locatorSource({ strategy: 'name', value: 'x"y' })).toBe('page.locator("[name=\\"x\\\\\\"y\\"]")');
  });
});
