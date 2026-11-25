import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl } from '../../src/auth/login.js';

describe('normalizeBaseUrl', () => {
  it('adds a scheme: http for local hosts, https otherwise', () => {
    expect(normalizeBaseUrl('127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeBaseUrl('localhost')).toBe('http://localhost');
    expect(normalizeBaseUrl('example.com')).toBe('https://example.com');
    expect(normalizeBaseUrl('http://x.test')).toBe('http://x.test');
  });
});
