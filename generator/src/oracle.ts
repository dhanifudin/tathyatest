import type { Field, Form } from './crawl.js';
import { locatorSource } from './locator.js';

export function errorAssertionSource(form: Form, field: Field, errorSelector: string, expectedPath?: string): string {
  const fieldLocator = locatorSource(field.locator);
  if (form.noValidate) {
    return [
      `await expect(page.locator(${JSON.stringify(errorSelector)}).first()).toBeVisible();`,
      `await expect(page).toHaveURL(new RegExp(${JSON.stringify(`${escapeRegExp(expectedPath ?? form.action)}(?:[?#].*)?$`)}));`,
    ].join('\n');
  }
  return [
    `await expect(${fieldLocator}).toHaveJSProperty('validity.valid', false);`,
  ].join('\n');
}

export function gracefulAssertionSource(): string {
  return `await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
