import type { Field } from './crawl.js';
import { fakerExprForField } from './faker.js';

/**
 * How a single field's fill value is realised in the emitted spec:
 * - `literal`: a deterministic string written verbatim (negative/edge targets, pinned
 *   `data.fields`, and `<select>`/radio/checkbox values that must be a real option).
 * - `runtime`: a faker expression emitted as `const f_<name> = <expr>` and filled fresh per run.
 * - `ref`: a `*_confirmation` field that must reuse the source field's runtime/literal value.
 */
export type FieldValue =
  | { kind: 'literal'; value: string }
  | { kind: 'runtime'; expr: string }
  | { kind: 'ref'; name: string };

export type FieldVariantKind = 'positive' | 'negative' | 'edge';
export type FieldVariant = {
  kind: FieldVariantKind;
  name: string;
  value: string;
  outcome: 'success' | 'error' | 'graceful';
  omit?: boolean;
  forceInvalidOption?: boolean;
};

export type FieldgenHints = {
  dataFields: Record<string, string>;
  defaults: Record<string, string>;
  unique: string[];
  duplicates: Record<string, string>;
  requiredFields: string[];
  confirmFields: string[];
};

export function variantsForField(field: Field, hints: FieldgenHints): FieldVariant[] {
  const valid = validValueForField(field, hints);
  const variants: FieldVariant[] = [{ kind: 'positive', name: 'valid', value: valid, outcome: 'success' }];
  const required = isRequired(field, hints);

  if (required) variants.push({ kind: 'negative', name: 'required-empty', value: '', outcome: 'error' });
  if (['email', 'url', 'number', 'tel'].includes(field.type)) {
    variants.push({ kind: 'negative', name: `${field.type}-format`, value: badFormatValue(field.type), outcome: 'error' });
  }
  if (field.constraints.pattern) variants.push({ kind: 'negative', name: 'pattern-fail', value: 'pattern_mismatch', outcome: 'error' });
  if (field.constraints.minlength !== null && field.constraints.minlength > 0) {
    variants.push({ kind: 'negative', name: 'minlength-minus-one', value: 'x'.repeat(field.constraints.minlength - 1), outcome: 'error' });
  }
  if (field.constraints.maxlength !== null) {
    variants.push({ kind: 'negative', name: 'maxlength-plus-one', value: 'x'.repeat(field.constraints.maxlength + 1), outcome: 'error' });
    variants.push({ kind: 'edge', name: 'maxlength-exact', value: 'x'.repeat(field.constraints.maxlength), outcome: 'success' });
    variants.push({ kind: 'edge', name: 'very-long', value: 'x'.repeat(Math.max(field.constraints.maxlength * 10, field.constraints.maxlength + 1)), outcome: 'graceful' });
  } else if (isTextLike(field)) {
    variants.push({ kind: 'edge', name: 'very-long', value: 'x'.repeat(10_000), outcome: 'graceful' });
  }
  if (field.constraints.min !== null) {
    variants.push({ kind: 'negative', name: 'min-minus-one', value: decrement(field.constraints.min), outcome: 'error' });
  }
  if (field.constraints.max !== null) {
    variants.push({ kind: 'negative', name: 'max-plus-one', value: increment(field.constraints.max), outcome: 'error' });
  }
  if (field.options?.length) {
    variants.push({ kind: 'negative', name: 'invalid-option', value: '__invalid_option__', outcome: 'error', forceInvalidOption: true });
  }
  if (hints.unique.includes(field.name)) {
    variants.push({ kind: 'negative', name: 'duplicate', value: hints.duplicates[field.name] ?? valid, outcome: 'error' });
  }
  if (field.nameHints.includes('confirmation') || hints.confirmFields.includes(field.name)) {
    variants.push({ kind: 'negative', name: 'confirmation-mismatch', value: `${valid}-mismatch`, outcome: 'error' });
  }
  if (isTextLike(field)) {
    variants.push({ kind: 'edge', name: 'unicode', value: 'こんにちは مرحبا 😀', outcome: 'graceful' });
    variants.push({ kind: 'edge', name: 'whitespace', value: `  ${valid}  `, outcome: 'graceful' });
  }
  if (!required) variants.push({ kind: 'edge', name: 'optional-omitted', value: '', outcome: 'graceful', omit: true });

  return variants;
}

/**
 * The valid fill value for a field, as a {@link FieldValue}. Select/radio/checkbox and pinned
 * `data.fields` entries are deterministic literals; `data.unique` fields are always generated at
 * runtime (with a uniqueness suffix) so repeated create runs never collide; everything else is a
 * runtime faker expression. Confirmation pairing is resolved by the mapper, which has form context.
 */
export function validFieldValue(field: Field, hints: FieldgenHints): FieldValue {
  if (field.options?.length) return { kind: 'literal', value: field.options[0].value };
  if (field.type === 'checkbox') return { kind: 'literal', value: 'on' };
  if (hints.unique.includes(field.name)) return { kind: 'runtime', expr: fakerExprForField(field, hints) };
  if (hints.dataFields[field.name] !== undefined) return { kind: 'literal', value: hints.dataFields[field.name] };
  return { kind: 'runtime', expr: fakerExprForField(field, hints) };
}

export function validValueForField(field: Field, hints: FieldgenHints): string {
  if (hints.dataFields[field.name] !== undefined) return hints.dataFields[field.name];
  if (field.options?.[0]) return field.options[0].value;
  if (hints.defaults[field.type] !== undefined) return hints.defaults[field.type];
  switch (field.type) {
    case 'email':
      return hints.defaults.email ?? 'user@example.com';
    case 'number':
      return hints.defaults.number ?? '1';
    case 'date':
      return hints.defaults.date ?? '2026-06-15';
    case 'url':
      return 'https://example.com';
    case 'tel':
      return '5550100';
    case 'checkbox':
      return 'on';
    default:
      return hints.defaults.text ?? 'Sample';
  }
}

function badFormatValue(type: string): string {
  if (type === 'number') return 'not-a-number';
  if (type === 'url') return 'not a url';
  if (type === 'tel') return 'not-a-phone';
  return 'not-an-email';
}

function isTextLike(field: Field): boolean {
  return ['text', 'search', 'email', 'url', 'tel', 'textarea', 'password'].includes(field.type);
}

function increment(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n + 1) : value;
}

function decrement(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n - 1) : value;
}

function isRequired(field: Field, hints: FieldgenHints): boolean {
  return field.required || hints.requiredFields.includes(field.name);
}
