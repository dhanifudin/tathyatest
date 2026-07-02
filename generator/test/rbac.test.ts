import { describe, expect, it } from 'vitest';
import { buildAccessMatrix } from '../src/rbac.js';
import type { CrawlOutput } from '../src/crawl.js';

function crawlWith(role: string, urls: string[]): CrawlOutput {
  return {
    baseUrl: 'http://127.0.0.1:8000',
    engine: 'rendered',
    role,
    crawledAt: '2026-06-15T00:00:00.000Z',
    pages: urls.map((url) => ({ url, title: url, forms: [], links: [], buttons: [], tables: [] })),
  };
}

describe('buildAccessMatrix', () => {
  it('collapses query variants of the same path into one route', () => {
    // Admin has more todos, so it reaches a pagination page the user never sees. That page is
    // not a separate protected route and must not become a "user blocked" case.
    const matrix = buildAccessMatrix([
      crawlWith('admin', ['/todos', '/todos?page=2', '/todos?page=3', '/admin/users']),
      crawlWith('user', ['/todos', '/todos?page=2']),
    ]);

    expect([...matrix.keys()].sort()).toEqual(['/admin/users', '/todos']);
    expect(matrix.get('/todos')?.reachableBy).toEqual(['admin', 'user']);
    expect(matrix.get('/admin/users')?.reachableBy).toEqual(['admin']);
  });

  it('keeps distinct paths distinct', () => {
    const matrix = buildAccessMatrix([
      crawlWith('admin', ['/todos/1/edit', '/todos/2/edit']),
      crawlWith('user', ['/todos/9/edit']),
    ]);

    expect([...matrix.keys()].sort()).toEqual(['/todos/1/edit', '/todos/2/edit', '/todos/9/edit']);
  });
});
