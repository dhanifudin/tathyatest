import type { Locator } from './crawl.js';

function q(value: string): string {
  return JSON.stringify(value);
}

export function locatorSource(locator: Locator): string {
  switch (locator.strategy) {
    case 'testid':
      return `page.getByTestId(${q(locator.value)})`;
    case 'role': {
      const [role, ...nameParts] = locator.value.split(':');
      const name = nameParts.join(':');
      return name ? `page.getByRole(${q(role)}, { name: ${q(name)} })` : `page.getByRole(${q(role)})`;
    }
    case 'label':
      return `page.getByLabel(${q(locator.value)}, { exact: true })`;
    case 'placeholder':
      return `page.getByPlaceholder(${q(locator.value)})`;
    case 'id':
      return `page.locator(${q(`#${locator.value}`)})`;
    case 'name':
      return `page.locator(${q(`[name="${cssEscape(locator.value)}"]`)})`;
    case 'css':
      return `page.locator(${q(locator.value)})`;
  }
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
