import { describe, expect, it } from 'vitest';
import { classifyCrudOp, type CrudSignals } from '../src/crud.js';

const post = (overrides: Partial<CrudSignals> = {}): CrudSignals => ({
  method: 'POST',
  spoofedMethod: null,
  turboMethod: null,
  hxMethod: null,
  action: '/todos',
  submitText: null,
  ...overrides,
});

describe('classifyCrudOp', () => {
  it('reads Laravel/Rails/Symfony method spoofing first', () => {
    expect(classifyCrudOp(post({ spoofedMethod: 'PUT', action: '/todos/3' }))).toBe('update');
    expect(classifyCrudOp(post({ spoofedMethod: 'patch', action: '/todos/3' }))).toBe('update');
    expect(classifyCrudOp(post({ spoofedMethod: 'DELETE', action: '/todos/3' }))).toBe('delete');
    // A spoofed verb beats every keyword rule.
    expect(classifyCrudOp(post({ spoofedMethod: 'DELETE', action: '/todos/3/edit', submitText: 'Save' }))).toBe('delete');
  });

  it('reads Rails Turbo and HTMX verb attributes', () => {
    expect(classifyCrudOp(post({ turboMethod: 'delete', action: '/posts/9' }))).toBe('delete');
    expect(classifyCrudOp(post({ hxMethod: 'put', action: '/posts/9' }))).toBe('update');
    expect(classifyCrudOp(post({ hxMethod: 'delete', action: '/posts/9' }))).toBe('delete');
    // hx-post carries no verb information beyond POST; keyword rules still apply.
    expect(classifyCrudOp(post({ hxMethod: 'post', action: '/users/add' }))).toBe('create');
  });

  it('treats GET forms as searches and filters', () => {
    expect(classifyCrudOp(post({ method: 'GET', action: '/todos?search=' }))).toBe('unknown');
    // Even with a keyword in the path: GET never mutates.
    expect(classifyCrudOp(post({ method: 'GET', action: '/todos/3/delete' }))).toBe('unknown');
  });

  it('falls back to action-path keywords (Django, Express, hand-rolled apps)', () => {
    expect(classifyCrudOp(post({ action: '/todos/3/delete/' }))).toBe('delete');
    expect(classifyCrudOp(post({ action: '/todos/3/destroy' }))).toBe('delete');
    expect(classifyCrudOp(post({ action: '/items/remove?id=3' }))).toBe('delete');
    expect(classifyCrudOp(post({ action: '/todos/3/update' }))).toBe('update');
    expect(classifyCrudOp(post({ action: '/todos/3/edit' }))).toBe('update');
    expect(classifyCrudOp(post({ action: '/todos/create' }))).toBe('create');
    expect(classifyCrudOp(post({ action: '/todos/store' }))).toBe('create');
    expect(classifyCrudOp(post({ action: '/users/new' }))).toBe('create');
    // Keywords must be whole path segments: /addresses is not an "add".
    expect(classifyCrudOp(post({ action: '/addresses', submitText: 'Delete' }))).toBe('delete');
  });

  it('falls back to submit-control text when the path says nothing', () => {
    expect(classifyCrudOp(post({ submitText: 'Delete' }))).toBe('delete');
    expect(classifyCrudOp(post({ submitText: 'Remove from cart' }))).toBe('delete');
    expect(classifyCrudOp(post({ submitText: 'Save changes' }))).toBe('update');
    expect(classifyCrudOp(post({ submitText: 'Update profile' }))).toBe('update');
    expect(classifyCrudOp(post({ submitText: 'Create' }))).toBe('create');
    expect(classifyCrudOp(post({ submitText: 'Add to cart' }))).toBe('create');
  });

  it('defaults a plain POST to create', () => {
    expect(classifyCrudOp(post({ submitText: 'Apply' }))).toBe('create');
    expect(classifyCrudOp(post({ action: '/logout', submitText: 'Log out' }))).toBe('create');
  });
});
