import type { Field } from '../crawl/model.js';
import type { FieldgenHints } from './fieldgen.js';

/**
 * Returns a faker expression string (valid TypeScript) that, when emitted inside a generated
 * spec, evaluates to a realistic value for `field`. The expression always evaluates to a string
 * so it can be passed straight to Playwright's `.fill()`. Pure: no I/O, no Playwright, no faker
 * call at generation time — the call happens at runtime inside the spec.
 */
export function fakerExprForField(field: Field, hints: FieldgenHints): string {
  const expr = baseExpr(field);
  return finalizeExpr(field, hints, expr);
}

/**
 * The words of a field name (`user[firstName]` → user, first, name). Short keywords are matched as
 * whole words: `country` is not a `count`, `message` has no `age`, `hotel` is not a `tel`.
 */
function wordsOf(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function baseExpr(field: Field): string {
  const name = field.name.toLowerCase();
  const words = wordsOf(field.name);
  const joined = words.join('');
  const has = (...keywords: string[]) => keywords.some((keyword) => words.includes(keyword));
  const contains = (...keywords: string[]) => keywords.some((keyword) => joined.includes(keyword));
  const numeric = field.type === 'number' || field.type === 'range';

  // Name-pattern map (semantic intent beats the raw input type).
  if (contains('email')) return 'faker.internet.email()';
  if (contains('username') || name === 'user' || name === 'login') return 'faker.internet.username()';
  if (has('link', 'website', 'homepage') || contains('url')) return 'faker.internet.url()';
  if (contains('slug')) return 'faker.lorem.slug()';
  if (has('tel', 'mobile') || contains('phone')) return 'faker.phone.number()';
  if (name.endsWith('_at') || has('date', 'deadline', 'birthday', 'dob') || contains('birthday', 'deadline') || words.some((word) => word.endsWith('date') && word !== 'update')) return dateExpr(field);
  if (has('total', 'cost') || contains('price', 'amount', 'salary')) return numeric ? numberExpr(field) : priceExpr(field);
  if (has('qty', 'count', 'age', 'year', 'stock') || contains('quantity')) return numberExpr(field);
  if (contains('firstname') || has('fname')) return 'faker.person.firstName()';
  if (contains('lastname') || has('lname')) return 'faker.person.lastName()';
  if (has('body', 'bio') || contains('description', 'content', 'notes', 'message', 'comment', 'summary')) return 'faker.lorem.paragraph()';
  if (has('label') || contains('title', 'subject', 'headline')) return loremWordsExpr(field);
  if (words.at(-1) === 'name' || contains('fullname')) return 'faker.person.fullName()';
  if (contains('company', 'organization', 'organisation')) return 'faker.company.name()';
  if (has('city')) return 'faker.location.city()';
  if (has('country')) return 'faker.location.country()';
  if (has('zip') || contains('zipcode', 'postcode', 'postal')) return 'faker.location.zipCode()';
  if (contains('address', 'street')) return 'faker.location.streetAddress()';
  if (has('color', 'colour')) return 'faker.color.human()';

  // Input-type map (honours HTML constraints).
  switch (field.type) {
    case 'email':
      return 'faker.internet.email()';
    case 'url':
      return 'faker.internet.url()';
    case 'tel':
      return 'faker.phone.number()';
    case 'number':
    case 'range':
      return numberExpr(field);
    case 'date':
      return dateExpr(field);
    case 'datetime-local':
      return dateTimeExpr(field);
    case 'time':
      return timeExpr(field);
    case 'month':
      return monthExpr(field);
    case 'password':
      return passwordExpr(field);
    case 'color':
      return 'faker.color.rgb()';
    case 'file':
      // Never reached: fieldgen hands file inputs a MIME-type literal, the emitter uploads a
      // fixture. Kept so a stray call still yields a harmless string.
      return "'text/plain'";
    default:
      return loremWordsExpr(field);
  }
}

function loremWordsExpr(field: Field): string {
  // Keep titles short; the maxlength cap in finalizeExpr trims anything longer.
  const min = field.constraints.minlength && field.constraints.minlength > 12 ? 3 : 2;
  return `faker.lorem.words({ min: ${min}, max: ${Math.max(min + 2, 4)} })`;
}

/** The value range of a numeric field: `min`/`max`, else a small positive default that fits them. */
function numberRange(field: Field): { low: number; high: number } {
  const max = toFiniteNumber(field.constraints.max);
  const low = toFiniteNumber(field.constraints.min) ?? (max !== null && max < 1 ? max - 100 : 1);
  return { low, high: Math.max(low, max ?? Math.max(low + 999, 1000)) };
}

/** A number inside the range and on the `step` grid the browser validates (anchored at `min`). */
function numberExpr(field: Field): string {
  const { low, high } = numberRange(field);
  const declared = toFiniteNumber(field.constraints.step);
  const step = declared !== null && declared > 0 ? declared : 1;
  const anchor = toFiniteNumber(field.constraints.min) ?? 0;
  if (step === 1 && Number.isInteger(anchor)) {
    const first = Math.ceil(low);
    return `String(faker.number.int({ min: ${first}, max: ${Math.max(first, Math.floor(high))} }))`;
  }
  const first = Math.ceil((low - anchor) / step - 1e-9);
  const last = Math.max(first, Math.floor((high - anchor) / step + 1e-9));
  const decimals = Math.max(decimalsOf(step), decimalsOf(anchor));
  return `(${anchor} + faker.number.int({ min: ${first}, max: ${last} }) * ${step}).toFixed(${decimals})`;
}

function decimalsOf(value: number): number {
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

function priceExpr(field: Field): string {
  const { low, high } = numberRange(field);
  return `faker.commerce.price({ min: ${low}, max: ${high}, dec: 2 })`;
}

function dateExpr(field: Field): string {
  return `${momentExpr(field.constraints.min, field.constraints.max, '')}.toISOString().slice(0, 10)`;
}

function dateTimeExpr(field: Field): string {
  // `datetime-local` bounds carry no zone; read them as UTC so the ISO slice stays inside them.
  return `${momentExpr(field.constraints.min, field.constraints.max, 'Z')}.toISOString().slice(0, 16)`;
}

/** A faker date within the bounds that exist; soon after today without any. */
function momentExpr(min: string | null, max: string | null, zone: string): string {
  const at = (value: string) => JSON.stringify(`${value}${zone}`);
  if (min && max) return `faker.date.between({ from: ${at(min)}, to: ${at(max)} })`;
  if (min) return `faker.date.soon({ refDate: ${at(min)} })`;
  if (max) return `faker.date.recent({ refDate: ${at(max)} })`;
  return 'faker.date.soon()';
}

function timeExpr(field: Field): string {
  const min = minutesOf(field.constraints.min);
  const max = minutesOf(field.constraints.max);
  if (min === null && max === null) return 'faker.date.soon().toISOString().slice(11, 16)';
  const low = min ?? 0;
  const high = Math.max(low, max ?? 23 * 60 + 59);
  return `((minutes: number) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'))(faker.number.int({ min: ${low}, max: ${high} }))`;
}

function minutesOf(value: string | null): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function monthExpr(field: Field): string {
  const min = monthsOf(field.constraints.min);
  const max = monthsOf(field.constraints.max);
  if (min === null && max === null) return 'faker.date.soon().toISOString().slice(0, 7)';
  const low = min ?? (max ?? 0) - 12;
  const high = Math.max(low, max ?? low + 12);
  return `((months: number) => Math.floor(months / 12) + '-' + String((months % 12) + 1).padStart(2, '0'))(faker.number.int({ min: ${low}, max: ${high} }))`;
}

function monthsOf(value: string | null): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function passwordExpr(field: Field): string {
  const length = Math.max(field.constraints.minlength ?? 12, 12);
  return `faker.internet.password({ length: ${length} })`;
}

/** Faker addresses run to about this length; a shorter `maxlength` needs a compact one. */
const LONG_EMAIL = 40;

function finalizeExpr(field: Field, hints: FieldgenHints, expr: string): string {
  const { minlength, maxlength } = field.constraints;
  const email = field.type === 'email' || /email/i.test(field.name);
  let out = expr;
  if (email && maxlength !== null && maxlength < LONG_EMAIL) {
    out = `faker.string.alphanumeric(${Math.max(1, Math.min(8, maxlength - 7))}).toLowerCase() + '@ex.com'`;
  }
  if (minlength !== null && minlength > 0 && shouldCap(field)) out = `(${out}).padEnd(${minlength}, 'x')`;
  if (maxlength !== null && shouldCap(field) && !email) out = `(${out}).slice(0, ${maxlength})`;
  if (hints.unique.includes(field.name)) out = uniqueExpr(field, out);
  return out;
}

// Only cap free-text values; slicing emails/urls/dates/numbers would corrupt their format.
function shouldCap(field: Field): boolean {
  return ['text', 'search', 'textarea', 'password', ''].includes(field.type);
}

function uniqueExpr(field: Field, expr: string): string {
  const { maxlength } = field.constraints;
  if (field.type === 'email' || /email/i.test(field.name)) {
    if (maxlength !== null && maxlength < LONG_EMAIL) return '`${Date.now().toString(36)}@ex.com`';
    return '`tt_${Date.now()}_${faker.string.alphanumeric(4).toLowerCase()}@example.com`';
  }
  const unique = `(${expr} + '_' + Date.now())`;
  // Keep the end, where the uniqueness is.
  return maxlength === null ? unique : `${unique}.slice(-${maxlength})`;
}

function toFiniteNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
