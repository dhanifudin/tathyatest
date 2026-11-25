import { describe, expect, it } from 'vitest';
import { fakerExprForField } from '../../src/generate/faker.js';
import type { Field } from '../../src/crawl/model.js';

const emptyHints = {
  dataFields: {},
  defaults: {},
  unique: [] as string[],
  duplicates: {},
  requiredFields: [] as string[],
  confirmFields: [] as string[],
};

function field(overrides: Partial<Field> & Pick<Field, 'name' | 'type'>): Field {
  return {
    label: null,
    required: false,
    constraints: { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null },
    options: null,
    nameHints: [],
    locator: { strategy: 'name', value: overrides.name },
    ...overrides,
  };
}

describe('fakerExprForField', () => {
  it('maps semantic field names to matching faker calls', () => {
    expect(fakerExprForField(field({ name: 'contact_email', type: 'text' }), emptyHints)).toContain('faker.internet.email');
    expect(fakerExprForField(field({ name: 'title', type: 'text' }), emptyHints)).toContain('faker.lorem.words');
    expect(fakerExprForField(field({ name: 'description', type: 'textarea' }), emptyHints)).toContain('faker.lorem.paragraph');
    expect(fakerExprForField(field({ name: 'due_date', type: 'text' }), emptyHints)).toContain('faker.date');
    expect(fakerExprForField(field({ name: 'unit_price', type: 'text' }), emptyHints)).toContain('faker.commerce.price');
    expect(fakerExprForField(field({ name: 'quantity', type: 'text' }), emptyHints)).toContain('faker.number.int');
  });

  it('honours the input type when the name is generic', () => {
    expect(fakerExprForField(field({ name: 'value', type: 'email' }), emptyHints)).toContain('faker.internet.email');
    expect(fakerExprForField(field({ name: 'value', type: 'url' }), emptyHints)).toContain('faker.internet.url');
    expect(fakerExprForField(field({ name: 'value', type: 'number' }), emptyHints)).toContain('faker.number.int');
    expect(fakerExprForField(field({ name: 'value', type: 'password', constraints: { minlength: 16, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null } }), emptyHints)).toContain('length: 16');
  });

  it('caps free text to maxlength but leaves formatted values intact', () => {
    const text = fakerExprForField(field({ name: 'note', type: 'text', constraints: { minlength: null, maxlength: 20, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null } }), emptyHints);
    expect(text).toContain('.slice(0, 20)');
    const email = fakerExprForField(field({ name: 'value', type: 'email', constraints: { minlength: null, maxlength: 20, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null } }), emptyHints);
    expect(email).not.toContain('.slice');
  });

  it('produces a unique runtime expression for unique fields', () => {
    const expr = fakerExprForField(field({ name: 'contact_email', type: 'email' }), { ...emptyHints, unique: ['contact_email'] });
    expect(expr).toContain('Date.now()');
    const slug = fakerExprForField(field({ name: 'slug', type: 'text' }), { ...emptyHints, unique: ['slug'] });
    expect(slug).toContain('Date.now()');
  });

  it('respects number range constraints', () => {
    const expr = fakerExprForField(field({ name: 'qty', type: 'number', constraints: { minlength: null, maxlength: null, min: '5', max: '9', step: null, pattern: null, inputmode: null, accept: null } }), emptyHints);
    expect(expr).toContain('min: 5');
    expect(expr).toContain('max: 9');
  });
});

describe('name words and constraints', () => {
  const none = { minlength: null, maxlength: null, min: null, max: null, step: null, pattern: null, inputmode: null, accept: null };
  const expr = (name: string, type = 'text', constraints: Partial<Field['constraints']> = {}) =>
    fakerExprForField(field({ name, type, constraints: { ...none, ...constraints } }), emptyHints);

  it('matches short keywords as whole words', () => {
    expect(expr('country')).toContain('faker.location.country');
    expect(expr('account')).not.toContain('faker.number');
    expect(expr('message')).toContain('faker.lorem.paragraph');
    expect(expr('page')).not.toContain('faker.number');
    expect(expr('hotel')).not.toContain('faker.phone');
    expect(expr('capacity')).not.toContain('faker.location.city');
    expect(expr('update_reason')).not.toContain('faker.date');
    expect(expr('startDate')).toContain('faker.date');
    expect(expr('user[firstName]')).toContain('faker.person.firstName');
  });

  it('keeps numbers inside the range and on the step grid', () => {
    expect(expr('qty', 'number', { min: '0.5', step: '0.5', max: '2' })).toBe('(0.5 + faker.number.int({ min: 0, max: 3 }) * 0.5).toFixed(1)');
    expect(expr('offset', 'number', { max: '-5' })).toBe('String(faker.number.int({ min: -105, max: -5 }))');
    expect(expr('price', 'number')).toContain('faker.number.int');
  });

  it('honours one-sided and time bounds', () => {
    expect(expr('when', 'date', { max: '2020-01-31' })).toContain('faker.date.recent({ refDate: "2020-01-31" })');
    expect(expr('at', 'time', { min: '09:00', max: '17:00' })).toContain('min: 540, max: 1020');
    expect(expr('period', 'month', { max: '2026-03' })).toContain('max: 24314');
  });

  it('respects minlength and a short email maxlength', () => {
    expect(expr('nickname', 'text', { minlength: 30 })).toContain(".padEnd(30, 'x')");
    expect(expr('email', 'email', { maxlength: 20 })).toBe("faker.string.alphanumeric(8).toLowerCase() + '@ex.com'");
  });
});

