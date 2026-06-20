import type { Field } from './crawl.js';
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

function baseExpr(field: Field): string {
  const name = field.name.toLowerCase();

  // Name-pattern map (semantic intent beats the raw input type).
  if (name.includes('email')) return 'faker.internet.email()';
  if (name.includes('username') || name === 'user' || name === 'login') return 'faker.internet.username()';
  if (/(^|_)(url|website|homepage|link)$/.test(name) || name.includes('url')) return 'faker.internet.url()';
  if (name.includes('slug')) return 'faker.lorem.slug()';
  if (name.includes('phone') || name.includes('tel') || name.includes('mobile')) return 'faker.phone.number()';
  if (name.endsWith('_at') || name.includes('date') || name.includes('deadline') || name.includes('birthday')) return dateExpr(field);
  if (name.includes('price') || name.includes('amount') || name.includes('cost') || name.includes('total') || name.includes('salary')) return priceExpr(field);
  if (name.includes('qty') || name.includes('quantity') || name.includes('count') || name.includes('stock') || name.includes('age') || name.includes('year')) return intStringExpr(field);
  if (name.includes('firstname') || name === 'first_name' || name === 'fname') return 'faker.person.firstName()';
  if (name.includes('lastname') || name === 'last_name' || name === 'lname') return 'faker.person.lastName()';
  if (name.includes('description') || name.includes('body') || name.includes('content') || name.includes('notes') || name.includes('message') || name.includes('comment') || name.includes('bio') || name.includes('summary')) return 'faker.lorem.paragraph()';
  if (name.includes('title') || name.includes('subject') || name.includes('headline') || name.includes('label')) return loremWordsExpr(field);
  if (name === 'name' || name.endsWith('_name') || name.includes('fullname')) return 'faker.person.fullName()';
  if (name.includes('company') || name.includes('organization') || name.includes('organisation')) return 'faker.company.name()';
  if (name.includes('city')) return 'faker.location.city()';
  if (name.includes('country')) return 'faker.location.country()';
  if (name.includes('zip') || name.includes('postcode') || name.includes('postal')) return 'faker.location.zipCode()';
  if (name.includes('address') || name.includes('street')) return 'faker.location.streetAddress()';
  if (name.includes('color') || name.includes('colour')) return 'faker.color.human()';

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
      return intStringExpr(field);
    case 'date':
      return dateExpr(field);
    case 'datetime-local':
      return 'faker.date.soon().toISOString().slice(0, 16)';
    case 'time':
      return 'faker.date.soon().toISOString().slice(11, 16)';
    case 'month':
      return 'faker.date.soon().toISOString().slice(0, 7)';
    case 'password':
      return passwordExpr(field);
    case 'color':
      return 'faker.color.rgb()';
    default:
      return loremWordsExpr(field);
  }
}

function loremWordsExpr(field: Field): string {
  // Keep titles short; the maxlength cap in finalizeExpr trims anything longer.
  const min = field.constraints.minlength && field.constraints.minlength > 12 ? 3 : 2;
  return `faker.lorem.words({ min: ${min}, max: ${Math.max(min + 2, 4)} })`;
}

function intStringExpr(field: Field): string {
  const min = toFiniteInt(field.constraints.min) ?? 1;
  const max = toFiniteInt(field.constraints.max) ?? Math.max(min + 999, 1000);
  return `String(faker.number.int({ min: ${min}, max: ${Math.max(min, max)} }))`;
}

function priceExpr(field: Field): string {
  const min = toFiniteNumber(field.constraints.min) ?? 1;
  const max = toFiniteNumber(field.constraints.max) ?? Math.max(min + 999, 1000);
  return `faker.commerce.price({ min: ${min}, max: ${Math.max(min, max)}, dec: 2 })`;
}

function dateExpr(field: Field): string {
  const min = field.constraints.min;
  const max = field.constraints.max;
  if (min && max) {
    return `faker.date.between({ from: ${JSON.stringify(min)}, to: ${JSON.stringify(max)} }).toISOString().slice(0, 10)`;
  }
  if (min) {
    return `faker.date.soon({ refDate: ${JSON.stringify(min)} }).toISOString().slice(0, 10)`;
  }
  return 'faker.date.soon().toISOString().slice(0, 10)';
}

function passwordExpr(field: Field): string {
  const length = Math.max(field.constraints.minlength ?? 12, 12);
  return `faker.internet.password({ length: ${length} })`;
}

function finalizeExpr(field: Field, hints: FieldgenHints, expr: string): string {
  let out = expr;
  if (field.constraints.maxlength !== null && shouldCap(field)) {
    out = `(${out}).slice(0, ${field.constraints.maxlength})`;
  }
  if (hints.unique.includes(field.name)) {
    out = uniqueExpr(field, out);
  }
  return out;
}

// Only cap free-text values; slicing emails/urls/dates/numbers would corrupt their format.
function shouldCap(field: Field): boolean {
  return ['text', 'search', 'textarea', 'password', ''].includes(field.type);
}

function uniqueExpr(field: Field, expr: string): string {
  if (field.type === 'email' || /email/i.test(field.name)) {
    return '`tt_${Date.now()}_${faker.string.alphanumeric(4).toLowerCase()}@example.com`';
  }
  return `(${expr} + '_' + Date.now())`;
}

function toFiniteInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFiniteNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
