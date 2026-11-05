import { describe, expect, it } from 'vitest';
import { escapeAttrValue, escapeRegExp } from '../../src/util/escape.js';
import { canonicalPath, stripQuery } from '../../src/util/paths.js';

describe('canonicalPath', () => {
  it('returns the path without origin, query, or fragment', () => {
    expect(canonicalPath('/todos?page=2#top')).toBe('/todos');
    expect(canonicalPath('http://127.0.0.1:8000/todos/1/edit?x=1')).toBe('/todos/1/edit');
    expect(canonicalPath('todos')).toBe('/todos');
    expect(canonicalPath('')).toBe('/');
  });
});

describe('stripQuery', () => {
  it('cuts at the first ? or # and keeps an absolute prefix as given', () => {
    expect(stripQuery('/a/b?x=1')).toBe('/a/b');
    expect(stripQuery('/a/b#frag')).toBe('/a/b');
    expect(stripQuery('http://h/a?x')).toBe('http://h/a');
    expect(stripQuery('/plain')).toBe('/plain');
    expect(stripQuery('?only')).toBe('');
  });
});

describe('escapers', () => {
  it('escapes quotes and backslashes for a quoted attribute selector', () => {
    expect(escapeAttrValue('a"b\\c')).toBe('a\\"b\\\\c');
  });
  it('escapes regexp metacharacters', () => {
    expect(new RegExp(escapeRegExp('a.b*c(d)')).test('a.b*c(d)')).toBe(true);
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('axb')).toBe(false);
  });
});
