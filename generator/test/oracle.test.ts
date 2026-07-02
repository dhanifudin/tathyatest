import { describe, expect, it } from 'vitest';
import { errorAssertionSource } from '../src/oracle.js';
import type { Field, Form } from '../src/crawl.js';

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

describe('errorAssertionSource', () => {
  it('uses native validation when novalidate is absent', () => {
    expect(errorAssertionSource(form, field, '.error')).toContain("validity.valid', false");
  });

  it('uses DOM error selector for server validated forms', () => {
    expect(errorAssertionSource({ ...form, noValidate: true }, field, '.error', '/login')).toContain("page.locator(\".error\")");
  });

  it('uses the DOM error selector for required-empty on fields without a native required attribute', () => {
    // data.requiredFields can force blank negatives for fields the app validates in JS or on the
    // server only (e.g. SauceDemo checkout) — validity.valid never flips for those.
    const optionalField: Field = { ...field, required: false };
    const assertion = errorAssertionSource(form, optionalField, '.error', '/checkout-step-one.html', 'required-empty');
    expect(assertion).toContain('page.locator(".error")');
    expect(assertion).not.toContain('validity.valid');
    // A natively-required field keeps the constraint-validation oracle.
    expect(errorAssertionSource(form, field, '.error', '/checkout-step-one.html', 'required-empty')).toContain("validity.valid', false");
  });
});
