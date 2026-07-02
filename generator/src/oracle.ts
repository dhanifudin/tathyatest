import type { Field, Form } from './crawl.js';
import { locatorSource } from './locator.js';

export function errorAssertionSource(form: Form, field: Field, errorSelector: string, expectedPath?: string, variantName?: string): string {
  const fieldLocator = locatorSource(field.locator);
  if (form.noValidate || !nativelyObservable(field, variantName)) {
    return [
      `await expect(page.locator(${JSON.stringify(errorSelector)}).first()).toBeVisible();`,
      `await expect(page).toHaveURL(new RegExp(${JSON.stringify(`${escapeRegExp(expectedPath ?? form.action)}(?:[?#].*)?$`)}));`,
    ].join('\n');
  }
  return [
    `await expect(${fieldLocator}).toHaveJSProperty('validity.valid', false);`,
  ].join('\n');
}

/**
 * Whether the violated constraint exists natively on the field, so constraint validation
 * (validity.valid) can observe it. A `required-empty` variant forced via `data.requiredFields`
 * on a field without the `required` attribute is only observable through the app's own error
 * display (JS validation or a server round-trip) — e.g. SauceDemo's checkout fields.
 */
function nativelyObservable(field: Field, variantName?: string): boolean {
  if (variantName === 'required-empty') return field.required;
  return true;
}

export function gracefulAssertionSource(): string {
  return `await expect(page.locator('body')).not.toContainText(/500|server error|exception/i);`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
