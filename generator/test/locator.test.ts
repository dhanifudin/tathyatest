import { describe, expect, it } from 'vitest';
import { locatorSource } from '../src/locator.js';

describe('locatorSource', () => {
  it('renders stable css selectors and role locators', () => {
    expect(locatorSource({ strategy: 'css', value: '#wrapper span' })).toBe('page.locator("#wrapper span")');
    expect(locatorSource({ strategy: 'role', value: 'textbox:Search' })).toBe('page.getByRole("textbox", { name: "Search" })');
    expect(locatorSource({ strategy: 'label', value: 'Contact email' })).toBe('page.getByLabel("Contact email", { exact: true })');
  });
});
