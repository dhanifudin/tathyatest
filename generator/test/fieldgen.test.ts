import { describe, expect, it } from 'vitest';
import { variantsForField } from '../src/fieldgen.js';
import type { Field } from '../src/crawl.js';

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

    expect(variants.map((variant) => variant.name)).toContain('valid');
    expect(variants.map((variant) => variant.name)).toContain('required-empty');
    expect(variants.map((variant) => variant.name)).toContain('maxlength-plus-one');
    expect(variants.map((variant) => variant.name)).toContain('maxlength-exact');
    expect(variants.map((variant) => variant.name)).toContain('unicode');
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

    expect(variants.map((variant) => variant.name)).toContain('required-empty');
    expect(variants.map((variant) => variant.name)).not.toContain('optional-omitted');
  });
});
