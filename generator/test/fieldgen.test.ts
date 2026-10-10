import { describe, expect, it } from 'vitest';
import { acceptedMime, mismatchingMime, patternBreaker, shiftBoundary, validFieldValue, variantsForField } from '../src/fieldgen.js';
import type { Field } from '../src/crawl.js';

const emptyConstraints = {
  minlength: null, maxlength: null, min: null, max: null,
  step: null, pattern: null, inputmode: null, accept: null,
};
const emptyHints = { dataFields: {}, defaults: {}, unique: [] as string[], duplicates: {}, requiredFields: [] as string[], confirmFields: [] as string[] };

const baseField: Field = {
  name: 'title',
  type: 'text',
  label: 'Title',
  required: true,
  constraints: {
    minlength: null,
    maxlength: 5,
    min: null,
    max: null,
    step: null,
    pattern: null,
    inputmode: null,
    accept: null,
  },
  options: null,
  nameHints: [],
  locator: { strategy: 'label', value: 'Title' },
};

const field = (overrides: Omit<Partial<Field>, 'constraints'> & { constraints?: Partial<Field['constraints']> }): Field => ({
  ...baseField,
  ...overrides,
  constraints: { ...emptyConstraints, ...(overrides.constraints ?? {}) },
});

const names = (variants: ReturnType<typeof variantsForField>) => variants.map((variant) => variant.name);
const valueOf = (variants: ReturnType<typeof variantsForField>, name: string) => variants.find((variant) => variant.name === name)?.value;

describe('variantsForField', () => {
  it('emits positive, negative, and edge variants from constraints', () => {
    const variants = variantsForField(baseField, {
      dataFields: { title: 'Hello' },
      defaults: { text: 'Sample' },
      unique: [],
      duplicates: {},
      requiredFields: [],
      confirmFields: [],
    });

    expect(names(variants)).toContain('valid');
    expect(names(variants)).toContain('required-empty');
    expect(names(variants)).toContain('maxlength-plus-one');
    expect(names(variants)).toContain('maxlength-exact');
    expect(names(variants)).toContain('unicode');
  });

  it('maxlength-exact uses a format-valid value for email/url/tel fields', () => {
    const emailField: Field = {
      name: 'contact_email', type: 'email', label: null, required: true,
      constraints: { ...emptyConstraints, maxlength: 255 },
      options: null, nameHints: [], locator: { strategy: 'name', value: 'contact_email' },
    };
    const emailVariants = variantsForField(emailField, emptyHints);
    const exactVariant = emailVariants.find((v) => v.name === 'maxlength-exact');
    expect(exactVariant).toBeDefined();
    expect(exactVariant!.value).toHaveLength(255);
    expect(exactVariant!.value).toContain('@example.com');

    const urlField: Field = {
      name: 'website', type: 'url', label: null, required: false,
      constraints: { ...emptyConstraints, maxlength: 100 },
      options: null, nameHints: [], locator: { strategy: 'name', value: 'website' },
    };
    const urlVariants = variantsForField(urlField, emptyHints);
    const urlExact = urlVariants.find((v) => v.name === 'maxlength-exact');
    expect(urlExact!.value).toHaveLength(100);
    expect(urlExact!.value).toMatch(/^https?:\/\//);

    const telField: Field = {
      name: 'phone', type: 'tel', label: null, required: false,
      constraints: { ...emptyConstraints, maxlength: 15 },
      options: null, nameHints: [], locator: { strategy: 'name', value: 'phone' },
    };
    const telVariants = variantsForField(telField, emptyHints);
    const telExact = telVariants.find((v) => v.name === 'maxlength-exact');
    expect(telExact!.value).toHaveLength(15);
    expect(telExact!.value).toMatch(/^\d+$/);
  });

  it('treats configured required fields as required', () => {
    const variants = variantsForField({
      ...baseField,
      required: false,
    }, {
      dataFields: { title: 'Hello' },
      defaults: { text: 'Sample' },
      unique: [],
      duplicates: {},
      requiredFields: ['title'],
      confirmFields: [],
    });

    expect(names(variants)).toContain('required-empty');
    expect(names(variants)).not.toContain('optional-omitted');
  });

  it('shifts date and time boundaries in their own format instead of resubmitting the boundary', () => {
    const date = variantsForField(field({ name: 'due_date', type: 'date', constraints: { min: '2026-01-01', max: '2026-12-31' } }), emptyHints);
    expect(valueOf(date, 'min-minus-one')).toBe('2025-12-31');
    expect(valueOf(date, 'max-plus-one')).toBe('2027-01-01');

    const dateTime = variantsForField(field({ name: 'starts_at', type: 'datetime-local', constraints: { min: '2026-03-01T09:00' } }), emptyHints);
    expect(valueOf(dateTime, 'min-minus-one')).toBe('2026-03-01T08:59');

    const time = variantsForField(field({ name: 'opens', type: 'time', constraints: { min: '09:00', max: '17:30' } }), emptyHints);
    expect(valueOf(time, 'min-minus-one')).toBe('08:59');
    expect(valueOf(time, 'max-plus-one')).toBe('17:31');

    const month = variantsForField(field({ name: 'period', type: 'month', constraints: { min: '2026-01' } }), emptyHints);
    expect(valueOf(month, 'min-minus-one')).toBe('2025-12');

    const week = variantsForField(field({ name: 'sprint', type: 'week', constraints: { max: '2026-W52' } }), emptyHints);
    expect(valueOf(week, 'max-plus-one')).toBe('2027-W01');

    const number = variantsForField(field({ name: 'qty', type: 'number', constraints: { min: '1', max: '10' } }), emptyHints);
    expect(valueOf(number, 'min-minus-one')).toBe('0');
    expect(valueOf(number, 'max-plus-one')).toBe('11');
  });

  it('skips boundary variants it cannot shift rather than emit a passing value as a negative', () => {
    const garbage = variantsForField(field({ name: 'due_date', type: 'date', constraints: { min: 'soon' } }), emptyHints);
    expect(names(garbage)).not.toContain('min-minus-one');
    const midnight = variantsForField(field({ name: 'opens', type: 'time', constraints: { min: '00:00' } }), emptyHints);
    expect(names(midnight)).not.toContain('min-minus-one');
    expect(shiftBoundary('abc', 'number', 1)).toBeNull();
    expect(shiftBoundary('2026-02-28', 'date', 1)).toBe('2026-03-01');
    expect(shiftBoundary('0.5', 'number', -1)).toBe('-0.5');
  });

  it('breaks a pattern with a value that actually fails it, or skips the variant', () => {
    expect(patternBreaker('[a-z_]+')).toBe('!');
    expect(patternBreaker('[A-Za-z0-9 _!@ü]+')).toBe('');
    expect(patternBreaker('\\d{4}')).toBe('!');
    expect(patternBreaker('.*')).toBeNull();
    expect(patternBreaker('[')).toBeNull();

    const slug = variantsForField(field({ name: 'slug', constraints: { pattern: '[a-z_]+' } }), emptyHints);
    expect(valueOf(slug, 'pattern-fail')).toBe('!');
    const anything = variantsForField(field({ name: 'free', constraints: { pattern: '.*' } }), emptyHints);
    expect(names(anything)).not.toContain('pattern-fail');
  });

  it('emits a step-misaligned negative for numeric inputs with a step', () => {
    const price = variantsForField(field({ name: 'price', type: 'number', constraints: { min: '2', step: '0.5' } }), emptyHints);
    expect(valueOf(price, 'step-misaligned')).toBe('2.25');
    const level = variantsForField(field({ name: 'level', type: 'range', constraints: { step: '10' } }), emptyHints);
    expect(valueOf(level, 'step-misaligned')).toBe('5');
    const any = variantsForField(field({ name: 'level', type: 'number', constraints: { step: 'any' } }), emptyHints);
    expect(names(any)).not.toContain('step-misaligned');
  });

  it('does not emit format negatives for inputs the browser sanitises (number, date-like, color)', () => {
    expect(names(variantsForField(field({ name: 'qty', type: 'number' }), emptyHints))).not.toContain('number-format');
    expect(names(variantsForField(field({ name: 'due', type: 'date' }), emptyHints))).not.toContain('date-format');
    expect(names(variantsForField(field({ name: 'mail', type: 'email' }), emptyHints))).toContain('email-format');
  });

  it('turns file inputs into fixture uploads with an accept-mismatch negative', () => {
    const avatar = field({ name: 'avatar', type: 'file', constraints: { accept: 'image/*' } });
    const variants = variantsForField(avatar, emptyHints);

    expect(validFieldValue(avatar, emptyHints)).toEqual({ kind: 'literal', value: 'image/png' });
    expect(valueOf(variants, 'valid')).toBe('image/png');
    expect(valueOf(variants, 'accept-mismatch')).toBe('text/plain');
    expect(names(variants)).toEqual(['valid', 'required-empty', 'accept-mismatch']);

    const attachment = field({ name: 'attachment', type: 'file', required: false, constraints: { accept: '.pdf,.docx' } });
    expect(valueOf(variantsForField(attachment, emptyHints), 'valid')).toBe('application/pdf');
    expect(names(variantsForField(attachment, emptyHints))).toEqual(['valid', 'accept-mismatch', 'optional-omitted']);

    expect(acceptedMime(null)).toBe('text/plain');
    expect(acceptedMime('.txt')).toBe('text/plain');
    expect(mismatchingMime('text/plain')).toBe('image/png');
  });
});
