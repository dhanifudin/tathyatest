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
});
