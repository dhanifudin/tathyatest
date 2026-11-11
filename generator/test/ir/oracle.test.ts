import { describe, expect, it } from 'vitest';
import { errorOracle } from '../../src/ir/build.js';
import type { Field, Form } from '../../src/crawl/model.js';

const field: Field = {
  name: 'email',
  type: 'email',
  label: 'Email',
  required: true,
  constraints: {
    minlength: null,
    maxlength: null,
    min: null,
    max: null,
    step: null,
    pattern: null,
    inputmode: null,
    accept: null,
  },
  options: null,
  nameHints: [],
  locator: { strategy: 'label', value: 'Email' },
};

const form: Form = {
  action: '/login',
  method: 'POST',
  crudOp: 'unknown',
  noValidate: false,
  fields: [field],
  submit: { text: 'Login', locator: { strategy: 'role', value: 'button:Login' } },
};

describe('errorOracle', () => {
  it('uses native validation when novalidate is absent', () => {
    expect(errorOracle(form, field, '.error')).toEqual({ type: 'native-invalid', target: field.locator });
  });

  it('uses DOM error selector for server validated forms', () => {
    expect(errorOracle({ ...form, noValidate: true }, field, '.error', '/login')).toEqual({ type: 'server-error', errorSelector: '.error', urlPattern: '/login(?:[?#].*)?$' });
  });

  it('uses the DOM error selector for required-empty on fields without a native required attribute', () => {
    // data.requiredFields can force blank negatives for fields the app validates in JS or on the
    // server only (e.g. SauceDemo checkout) — validity.valid never flips for those.
    const optionalField: Field = { ...field, required: false };
    expect(errorOracle(form, optionalField, '.error', '/checkout-step-one.html', 'required-empty')).toEqual({ type: 'server-error', errorSelector: '.error', urlPattern: '/checkout-step-one\\.html(?:[?#].*)?$' });
    // A natively-required field keeps the constraint-validation oracle.
    expect(errorOracle(form, field, '.error', '/checkout-step-one.html', 'required-empty').type).toBe('native-invalid');
  });
});
