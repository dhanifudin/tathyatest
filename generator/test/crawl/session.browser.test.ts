import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { crawlRole } from '../../src/crawl/session.js';
import { setLogSink } from '../../src/logger.js';
import { chromiumAvailable, launchBrowser, serveRoutes, type FixtureApp, type Route } from '../helpers/browser.js';
import { makeConfig } from '../helpers/fixtures.js';

const loginForm = '<form method="post" action="/login"><input type="email" name="email"><input type="password" name="password"><button>Log in</button></form>';
const html = (body: string) => `<!doctype html><title>fixture</title>${body}`;
const links = (...paths: string[]) => paths.map((path) => `<a href="${path}">${path}</a>`).join('');
const signedIn = (cookie: string | undefined) => cookie?.includes('sid=1') === true;

/** Routes behind the fixture login; a visit without the cookie is redirected to `/login`. */
function app(pages: Record<string, Route>): Record<string, Route> {
  const guarded = Object.fromEntries(Object.entries(pages).map(([path, route]): [string, Route] => [path, (request, form) =>
    signedIn(request.headers.cookie)
      ? typeof route === 'function' ? route(request, form) : route
      : { status: 302, headers: { location: '/login' } }]));
  return {
    ...guarded,
    '/login': (request) => request.method === 'POST'
      ? { status: 302, headers: { location: '/home', 'set-cookie': 'sid=1; Path=/' } }
      : { body: html(loginForm) },
  };
}

describe.skipIf(!chromiumAvailable)('crawlRole against a fixture app', () => {
  let browser: Browser;
  let fixture: FixtureApp | undefined;
  const warnings: string[] = [];
  const restore = setLogSink({ info: () => undefined, warn: (message) => warnings.push(message) });

  beforeAll(async () => { browser = await launchBrowser(); });
  afterAll(async () => { await browser.close(); restore(); });
  afterEach(async () => { await fixture?.close(); fixture = undefined; warnings.length = 0; });

  async function crawl(pages: Record<string, Route>, crawlOptions: Record<string, unknown> = {}) {
    fixture = await serveRoutes(app(pages));
    const config = makeConfig({ baseUrl: fixture.baseUrl, crawl: { include: [], ...crawlOptions } });
    const context = await browser.newContext({ baseURL: fixture.baseUrl });
    try {
      const output = await crawlRole(context, config, config.auth.roles[0] ?? { name: 'admin', username: 'a', password: 'b' });
      return output.pages.map((page) => page.url).sort();
    } finally {
      await context.close();
    }
  }

  it('skips pages deeper than maxDepth and keeps crawling the rest', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/a/b/c', '/later')) },
      '/a/b/c': { body: html(links('/home')) },
      '/later': { body: html(links('/home')) },
    }, { maxDepth: 2 });
    expect(urls).toEqual(['/home', '/later']);
  });

  it('records neither denied pages nor error pages, but keeps an app shell served with 404', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/admin', '/broken', '/deep', '/gone')) },
      '/admin': { status: 403, body: html(links('/home')) },
      '/broken': { status: 500, body: html(links('/home')) },
      '/deep': { status: 404, body: html(links('/home')) },
      '/gone': { status: 404, body: html('<h1>Not found</h1>') },
    });
    expect(urls).toEqual(['/deep', '/home']);
  });

  it('survives a link that downloads a file', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/export.csv', '/next')) },
      '/export.csv': { body: 'a,b', headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="export.csv"' } },
      '/next': { body: html(links('/home')) },
    });
    expect(urls).toEqual(['/home', '/next']);
    expect(warnings.join('\n')).toContain('/export.csv');
  });

  it('records a page once when several links redirect to it', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/old', '/new')) },
      '/old': { status: 302, headers: { location: '/new' } },
      '/new': { body: html(links('/home')) },
    });
    expect(urls).toEqual(['/home', '/new']);
  });

  it('never follows a logout link', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/logout', '/next')) },
      '/logout': { status: 302, headers: { location: '/login', 'set-cookie': 'sid=0; Path=/' } },
      '/next': { body: html(links('/home')) },
    });
    expect(urls).toEqual(['/home', '/next']);
    expect(fixture?.requests).not.toContain('GET /logout');
  });

  it('logs in again when a page ends the session, and never records the login page', { timeout: 60_000 }, async () => {
    const urls = await crawl({
      '/home': { body: html(links('/trap', '/after')) },
      '/trap': { body: html(links('/home')), headers: { 'set-cookie': 'sid=0; Path=/' } },
      '/after': { body: html(links('/home')) },
    });
    expect(urls).toEqual(['/after', '/home', '/trap']);
    expect(fixture?.requests.filter((request) => request === 'POST /login')).toHaveLength(2);
  });
});
