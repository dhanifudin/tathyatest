import { describe, expect, it } from 'vitest';
import { variantsForField } from '../src/fieldgen.js';
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

    expect(variants.map((variant) => variant.name)).toContain('required-empty');
    expect(variants.map((variant) => variant.name)).not.toContain('optional-omitted');
  });
});
