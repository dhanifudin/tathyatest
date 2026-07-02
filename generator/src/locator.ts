import type { Locator } from './crawl.js';

function q(value: string): string {
  return JSON.stringify(value);
}

/**
 * Render a Playwright locator expression for `locator`, rooted at `scope` — `page` by default,
 * or any expression that evaluates to a Playwright Locator (the getBy and locator methods exist
 * on both). Scoping disambiguates repeated per-row controls (e.g. one submit per table row).
 */
export function locatorSource(locator: Locator, scope = 'page'): string {
  switch (locator.strategy) {
    case 'testid':
      return `${scope}.getByTestId(${q(locator.value)})`;
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      return name ? `${scope}.getByRole(${q(role)}, { name: ${q(name)} })` : `${scope}.getByRole(${q(role)})`;
    }
    case 'label':
      return `${scope}.getByLabel(${q(locator.value)}, { exact: true })`;
    case 'placeholder':
      return `${scope}.getByPlaceholder(${q(locator.value)})`;
    case 'id':
      return `${scope}.locator(${q(`#${locator.value}`)})`;
    case 'name':
      return `${scope}.locator(${q(`[name="${cssEscape(locator.value)}"]`)})`;
    case 'css':
      return `${scope}.locator(${q(locator.value)})`;
  }
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
