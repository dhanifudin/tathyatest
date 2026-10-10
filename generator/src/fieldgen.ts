import type { Field } from './crawl.js';
import { fakerExprForField } from './faker.js';

/**
 * How a single field's fill value is realised in the emitted spec:
 * - `literal`: a deterministic string written verbatim (negative/edge targets, pinned
 *   `data.fields`, and `<select>`/radio/checkbox values that must be a real option). For
 *   `type=file` fields the literal is a MIME type: the emitter uploads a small fixture of it.
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

/**
 * Input types whose malformed values a browser would simply refuse or sanitise to empty
 * (Playwright cannot even `fill()` them), so a "format" negative is unfalsifiable end to end:
 * number (covered by min/max/step instead), date-like, color.
 */
const FORMAT_VARIANT_TYPES = ['email', 'url', 'tel'];

export function variantsForField(field: Field, hints: FieldgenHints): FieldVariant[] {
  const valid = validValueForField(field, hints);
  const variants: FieldVariant[] = [{ kind: 'positive', name: 'valid', value: valid, outcome: 'success' }];
  const required = isRequired(field, hints);
  const isConfirmation = field.nameHints.includes('confirmation') || hints.confirmFields.includes(field.name);

  if (required) variants.push({ kind: 'negative', name: 'required-empty', value: '', outcome: 'error' });

  if (field.type === 'file') {
    // Uploads: the only observable constraint is `accept`; length/format/text variants are
    // meaningless for a file picker.
    if (field.constraints.accept) {
      variants.push({ kind: 'negative', name: 'accept-mismatch', value: mismatchingMime(field.constraints.accept), outcome: 'error' });
    }
    if (!required) variants.push({ kind: 'edge', name: 'optional-omitted', value: '', outcome: 'graceful', omit: true });
    return variants;
  }

  // Confirmation fields exist only to echo another field's value. Length/format variants are
  // meaningless for them because they cannot differ from the source field without a mismatch error.
  // Only the required-empty and confirmation-mismatch tests make semantic sense for them.
  if (!isConfirmation) {
    if (FORMAT_VARIANT_TYPES.includes(field.type)) {
      variants.push({ kind: 'negative', name: `${field.type}-format`, value: badFormatValue(field.type), outcome: 'error' });
    }
    if (field.constraints.pattern) {
      const breaker = patternBreaker(field.constraints.pattern);
      if (breaker !== null) variants.push({ kind: 'negative', name: 'pattern-fail', value: breaker, outcome: 'error' });
    }
    if (field.constraints.minlength !== null && field.constraints.minlength > 0) {
      variants.push({ kind: 'negative', name: 'minlength-minus-one', value: 'x'.repeat(field.constraints.minlength - 1), outcome: 'error' });
    }
    if (field.constraints.maxlength !== null) {
      variants.push({ kind: 'negative', name: 'maxlength-plus-one', value: 'x'.repeat(field.constraints.maxlength + 1), outcome: 'error' });
      variants.push({ kind: 'edge', name: 'maxlength-exact', value: maxlengthExactValue(field), outcome: 'success' });
      variants.push({ kind: 'edge', name: 'very-long', value: 'x'.repeat(Math.max(field.constraints.maxlength * 10, field.constraints.maxlength + 1)), outcome: 'graceful' });
    } else if (isTextLike(field)) {
      variants.push({ kind: 'edge', name: 'very-long', value: 'x'.repeat(10_000), outcome: 'graceful' });
    }
    const belowMin = field.constraints.min !== null ? shiftBoundary(field.constraints.min, field.type, -1) : null;
    if (belowMin !== null) variants.push({ kind: 'negative', name: 'min-minus-one', value: belowMin, outcome: 'error' });
    const aboveMax = field.constraints.max !== null ? shiftBoundary(field.constraints.max, field.type, 1) : null;
    if (aboveMax !== null) variants.push({ kind: 'negative', name: 'max-plus-one', value: aboveMax, outcome: 'error' });
    const offStep = stepMisalignedValue(field);
    if (offStep !== null) variants.push({ kind: 'negative', name: 'step-misaligned', value: offStep, outcome: 'error' });
    if (isTextLike(field)) {
      variants.push({ kind: 'edge', name: 'unicode', value: 'こんにちは مرحبا 😀', outcome: 'graceful' });
      variants.push({ kind: 'edge', name: 'whitespace', value: `  ${valid}  `, outcome: 'graceful' });
    }
  }

  if (field.options?.length) {
    variants.push({ kind: 'negative', name: 'invalid-option', value: '__invalid_option__', outcome: 'error', forceInvalidOption: true });
  }
  if (hints.unique.includes(field.name)) {
    variants.push({ kind: 'negative', name: 'duplicate', value: hints.duplicates[field.name] ?? valid, outcome: 'error' });
  }
  if (isConfirmation) {
    variants.push({ kind: 'negative', name: 'confirmation-mismatch', value: `${valid}-mismatch`, outcome: 'error' });
  }
  if (!required) variants.push({ kind: 'edge', name: 'optional-omitted', value: '', outcome: 'graceful', omit: true });

  return variants;
}

/**
 * The valid fill value for a field, as a {@link FieldValue}. Select/radio/checkbox and pinned
 * `data.fields` entries are deterministic literals; file inputs get a MIME type the emitter turns
 * into a fixture upload; `data.unique` fields are always generated at runtime (with a uniqueness
 * suffix) so repeated create runs never collide; everything else is a runtime faker expression.
 * Confirmation pairing is resolved by the mapper, which has form context.
 */
export function validFieldValue(field: Field, hints: FieldgenHints): FieldValue {
  if (field.options?.length) return { kind: 'literal', value: field.options[0].value };
  if (field.type === 'checkbox') return { kind: 'literal', value: 'on' };
  if (field.type === 'file') return { kind: 'literal', value: acceptedMime(field.constraints.accept) };
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
    case 'file':
      return acceptedMime(field.constraints.accept);
    default:
      return hints.defaults.text ?? 'Sample';
  }
}

function badFormatValue(type: string): string {
  if (type === 'url') return 'not a url';
  if (type === 'tel') return 'not-a-phone';
  return 'not-an-email';
}

export function isTextLike(field: Pick<Field, 'type'>): boolean {
  return ['text', 'search', 'email', 'url', 'tel', 'textarea', 'password'].includes(field.type);
}

// ---------------------------------------------------------------------------------------------
// Boundaries: numbers, dates, times, months, weeks
// ---------------------------------------------------------------------------------------------

/**
 * One unit past a `min`/`max` boundary in the field's own value format: ±1 for numbers,
 * ±1 day for dates, ±1 minute for datetime-local/time, ±1 month, ±1 week. `null` when the
 * boundary is unparseable (then no boundary variant is emitted — the old behaviour of
 * submitting the boundary itself expected an error for a valid value).
 */
export function shiftBoundary(boundary: string, type: string, delta: 1 | -1): string | null {
  switch (type) {
    case 'date':
      return shiftDate(boundary, delta);
    case 'datetime-local':
      return shiftDateTime(boundary, delta);
    case 'time':
      return shiftTime(boundary, delta);
    case 'month':
      return shiftMonth(boundary, delta);
    case 'week':
      return shiftWeek(boundary, delta);
    default: {
      const n = Number(boundary);
      if (boundary.trim() === '' || !Number.isFinite(n)) return null;
      return formatNumber(n + delta);
    }
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(10)));
}

function shiftDate(value: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function shiftDateTime(value: string, minutes: number): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match) return null;
  const base = new Date(`${match[1]}T${match[2]}:${match[3]}:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return base.toISOString().slice(0, 16);
}

function shiftTime(value: string, minutes: number): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  // Wrapping around midnight would land inside the range again, so no variant then.
  if (total < 0 || total > 23 * 60 + 59) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shiftMonth(value: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
}

function shiftWeek(value: string, weeks: number): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const week = Number(match[2]) + weeks;
  const year = Number(match[1]);
  if (week >= 1 && week <= 52) return `${year}-W${String(week).padStart(2, '0')}`;
  // Crossing a year boundary: move to the neighbouring year's first/last week.
  return week < 1 ? `${year - 1}-W52` : `${year + 1}-W01`;
}

/** A value between two step points, for numeric inputs that declare a `step`. */
function stepMisalignedValue(field: Field): string | null {
  if (!['number', 'range'].includes(field.type) || field.constraints.step === null) return null;
  const step = Number(field.constraints.step);
  if (!Number.isFinite(step) || step <= 0) return null;
  const base = field.constraints.min !== null && Number.isFinite(Number(field.constraints.min)) ? Number(field.constraints.min) : 0;
  return formatNumber(base + step / 2);
}

// ---------------------------------------------------------------------------------------------
// Patterns and uploads
// ---------------------------------------------------------------------------------------------

const PATTERN_CANDIDATES = ['!', '1', 'a b', 'ü', '_', 'a', 'A', '@', '', 'x'.repeat(40), '0123456789', 'pattern_mismatch'];

/**
 * A value that does NOT satisfy the HTML `pattern` (anchored like the browser does). `null` when
 * the pattern is invalid or every candidate satisfies it — then the variant is skipped rather than
 * emitted with a value that might pass.
 */
export function patternBreaker(pattern: string): string | null {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${pattern})$`, 'v');
  } catch {
    try {
      regex = new RegExp(`^(?:${pattern})$`, 'u');
    } catch {
      return null;
    }
  }
  return PATTERN_CANDIDATES.find((candidate) => !regex.test(candidate)) ?? null;
}

const EXTENSION_MIMES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip',
  mp3: 'audio/mpeg', mp4: 'video/mp4', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** A concrete MIME type the `accept` list allows (first entry wins); `text/plain` without one. */
export function acceptedMime(accept: string | null): string {
  const first = (accept ?? '').split(',').map((entry) => entry.trim()).find((entry) => entry.length > 0);
  if (!first) return 'text/plain';
  if (first.startsWith('.')) return EXTENSION_MIMES[first.slice(1).toLowerCase()] ?? 'application/octet-stream';
  if (first.endsWith('/*')) {
    const family = first.slice(0, -2);
    return family === 'image' ? 'image/png' : family === 'audio' ? 'audio/mpeg' : family === 'video' ? 'video/mp4' : `${family}/octet-stream`;
  }
  return first;
}

/** A MIME type the `accept` list rejects. */
export function mismatchingMime(accept: string): string {
  const entries = accept.split(',').map((entry) => entry.trim().toLowerCase());
  const allowsText = entries.some((entry) => entry === 'text/*' || entry === 'text/plain' || entry === '.txt');
  return allowsText ? 'image/png' : 'text/plain';
}

function maxlengthExactValue(field: Field): string {
  const n = field.constraints.maxlength!;
  switch (field.type) {
    case 'email': {
      // Pad the local part: u…u@example.com — long enough to hit maxlength.
      const domain = '@example.com'; // 12 chars
      const localLen = Math.max(n - domain.length, 1);
      return ('u'.repeat(localLen) + domain).slice(0, n);
    }
    case 'url': {
      const prefix = 'https://example.com/'; // 20 chars
      return n <= prefix.length ? 'https://x.co/' : (prefix + 'a'.repeat(n - prefix.length)).slice(0, n);
    }
    case 'tel':
      // Digit-only strings of exactly n characters satisfy most tel validators.
      return '5'.repeat(n);
    default:
      return 'x'.repeat(n);
  }
}

function isRequired(field: Field, hints: FieldgenHints): boolean {
  return field.required || hints.requiredFields.includes(field.name);
}
