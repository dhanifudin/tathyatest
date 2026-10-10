import { describe, expect, it } from 'vitest';
import { assertRenderedLoginSucceeded, isMeaningfulErrorPage, renderedCrawlSeeds, shouldExtractCrawlPage } from '../src/extract/rendered.js';

const baseConfig = {
  auth: {
    loginPath: '/',
    roles: [{ name: 'standard', username: 'standard_user', password: 'secret_sauce' }],
  },
  crawl: { maxDepth: 3, maxPages: 100, include: [], exclude: [] },
};

describe('rendered crawl URL normalization', () => {
  it('seeds rendered crawl from post-login landing and does not invent case-study paths', () => {
    expect(renderedCrawlSeeds(baseConfig, '/inventory.html')).toEqual(['/inventory.html']);
    expect(renderedCrawlSeeds({ ...baseConfig, auth: { ...baseConfig.auth, loginPath: '/login' } }, '/inventory.html')).toEqual(['/inventory.html', '/']);
    expect(renderedCrawlSeeds({ ...baseConfig, crawl: { ...baseConfig.crawl, include: ['/reports'] } }, '/inventory.html')).toEqual(['/inventory.html', '/reports']);

    const seeds = renderedCrawlSeeds(baseConfig, '/inventory.html');
    expect(seeds).not.toContain('/todos');
    expect(seeds).not.toContain('/dashboard');
    expect(seeds).not.toContain('/admin');
  });

  it('extracts an already-loaded rendered landing page without requiring a navigation response', () => {
    expect(shouldExtractCrawlPage(null, '/inventory.html', '/inventory.html')).toBe(true);
    // SPA hosts serve deep links with a 404 status while the client router renders the page.
    expect(shouldExtractCrawlPage(false, '/cart.html', '/cart.html')).toBe(true);
    expect(shouldExtractCrawlPage(false, '/inventory.html', '/redirected.html')).toBe(false);
    expect(shouldExtractCrawlPage(true, '/inventory.html', '/redirected.html')).toBe(true);
  });

  it('filters genuine error pages by their lack of navigable content', () => {
    const empty = { forms: [], links: [], controls: [] };
    const withLinks = { ...empty, links: [{ href: '/cart.html', text: 'Cart', locator: { strategy: 'role' as const, value: 'link:Cart' } }] };
    expect(isMeaningfulErrorPage(false, empty)).toBe(true);       // Laravel 404 page
    expect(isMeaningfulErrorPage(false, withLinks)).toBe(false);  // SPA page behind a 404 status
    expect(isMeaningfulErrorPage(true, empty)).toBe(false);       // ok responses are always kept
    expect(isMeaningfulErrorPage(null, empty)).toBe(false);       // already-on-page extraction
    // Debug error pages (e.g. Laravel 405 with APP_DEBUG=true) render buttons but no
    // same-origin links/forms — they must still be filtered, so buttons carry no signal.
    expect(isMeaningfulErrorPage(false, empty)).toBe(true);
  });

  it('fails clearly when login remains on the login page with controls visible', async () => {
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => true,
        }),
      }),
    };

    await expect(assertRenderedLoginSucceeded(page as never, baseConfig, 'standard', '/')).rejects.toThrow(
      /role "standard".*credentials may be invalid.*login page/,
    );
  });

  it('allows login-path landing when login controls are no longer visible', async () => {
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => false,
        }),
      }),
    };

    await expect(assertRenderedLoginSucceeded(page as never, baseConfig, 'standard', '/')).resolves.toBeUndefined();
  });
});
